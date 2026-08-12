import { NextRequest, NextResponse } from "next/server";
import { actionOrOAuthAuthorized } from "../../../lib/supabaseAuth";

const PARTNER_TAG = "ratemyfacegpt-20";
const MARKETPLACE = "www.amazon.com";
const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SEARCH_URL = "https://creatorsapi.amazon/catalog/v1/searchItems";
const ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

type ProductRequest = {
  concern?: string;
  product_type?: string;
  brand?: string;
  budget?: string | number;
  region?: string;
};

function clean(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function budgetToCents(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) return undefined;
  return Math.round(parsed * 100);
}

/** Case-insensitive token dedupe; preserves first-seen casing and order. */
function dedupeTokens(text: string): string {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens.join(" ");
}

/**
 * Build a clean Amazon keywords string from brand / product_type / concern
 * without repeating brand or concern tokens already present in other fields.
 */
function buildKeywords(brand: string, productType: string, concern: string): string {
  return dedupeTokens([brand, productType, concern].filter(Boolean).join(" ")).slice(0, 180);
}

function isValidAsin(value: unknown): value is string {
  return typeof value === "string" && ASIN_PATTERN.test(value.trim());
}

function isAmazonHostname(hostname: string): boolean {
  return hostname === "amazon.com" || hostname.endsWith(".amazon.com");
}

function taggedDpUrl(asin: string): string {
  const url = new URL(`https://www.amazon.com/dp/${asin.trim()}`);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

function taggedSearchUrl(keywords: string): string {
  const url = new URL("https://www.amazon.com/s");
  url.searchParams.set("k", keywords);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

/** Ensure partner tag is present on an Amazon product URL; returns null if unusable. */
function ensurePartnerTag(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!isAmazonHostname(url.hostname)) return null;
    url.searchParams.set("tag", PARTNER_TAG);
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Prefer ASIN /dp/ links; otherwise use detailPageURL with tag ensured.
 * Returns null when neither yields a usable product URL (caller falls back to search).
 */
function resolveAffiliateUrl(asin: unknown, detailPageURL: unknown): string | null {
  if (isValidAsin(asin)) return taggedDpUrl(asin);
  if (typeof detailPageURL === "string" && detailPageURL.trim()) {
    return ensurePartnerTag(detailPageURL.trim());
  }
  return null;
}

function fallbackResponse(keywords: string, reason: string) {
  return NextResponse.json({
    ok: true,
    link_type: "amazon_search",
    asin: null,
    title: `Amazon results for ${keywords}`,
    affiliate_url: taggedSearchUrl(keywords),
    image_url: null,
    price: null,
    partner_tag: PARTNER_TAG,
    marketplace: MARKETPLACE,
    fallback_reason: reason
  });
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) return tokenCache.token;

  const clientId = process.env.AMAZON_CREATORS_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CREATORS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Amazon Creators API credentials are not configured.");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "creatorsapi::default"
    }),
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") throw new Error(`Amazon token request failed (${response.status}).`);

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  tokenCache = { token: data.access_token, expiresAt: now + expiresIn * 1000 };
  return data.access_token;
}

/** Accept items with a usable ASIN; do not require a pre-tagged detailPageURL. */
function isAcceptableProduct(candidate: any): boolean {
  if (!isValidAsin(candidate?.asin)) return false;

  const detail = typeof candidate?.detailPageURL === "string" ? candidate.detailPageURL.trim() : "";
  if (!detail) return true; // ASIN alone is enough to build /dp/{ASIN}

  try {
    const url = new URL(detail);
    // Prefer amazon.com product URLs; reject clearly non-Amazon hosts.
    return isAmazonHostname(url.hostname);
  } catch {
    // Malformed detail URL — still accept when ASIN is usable.
    return true;
  }
}

export async function POST(request: NextRequest) {
  if (!(await actionOrOAuthAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let input: ProductRequest;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const region = clean(input.region || "US", 16).toUpperCase();
  if (!["US", "USA", "UNITED STATES"].includes(region)) {
    return NextResponse.json({ ok: false, error: "unsupported_region", message: "This deployment currently supports the US Amazon Associates store only." }, { status: 400 });
  }

  const concern = clean(input.concern);
  const productType = clean(input.product_type);
  const brand = clean(input.brand, 80);
  if (!productType) return NextResponse.json({ ok: false, error: "product_type_required" }, { status: 400 });

  const keywords = buildKeywords(brand, productType, concern);
  const maxPrice = budgetToCents(input.budget);
  const amazonConfigured = Boolean(process.env.AMAZON_CREATORS_CLIENT_ID && process.env.AMAZON_CREATORS_CLIENT_SECRET);
  if (!amazonConfigured) return fallbackResponse(keywords, "creators_api_not_configured");

  try {
    const token = await getAccessToken();
    const body: Record<string, unknown> = {
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
      keywords,
      itemCount: 5,
      sortBy: "Relevance",
      resources: ["images.primary.medium", "itemInfo.title", "offersV2.listings.price"]
    };
    if (brand) body.brand = brand;
    if (maxPrice) body.maxPrice = maxPrice;

    const amazonResponse = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-marketplace": MARKETPLACE
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    const data = await amazonResponse.json().catch(() => ({}));
    if (!amazonResponse.ok) {
      console.error("Amazon SearchItems failed", amazonResponse.status);
      return fallbackResponse(keywords, `creators_api_${amazonResponse.status}`);
    }

    const items = Array.isArray(data?.searchResult?.items) ? data.searchResult.items : [];
    const item = items.find(isAcceptableProduct);

    if (!item) return fallbackResponse(keywords, "no_vended_product_link");

    const affiliateUrl = resolveAffiliateUrl(item.asin, item.detailPageURL);
    if (!affiliateUrl) return fallbackResponse(keywords, "no_vended_product_link");

    const title = item?.itemInfo?.title?.displayValue;
    const imageUrl = item?.images?.primary?.medium?.url;
    const price = item?.offersV2?.listings?.[0]?.price;
    const asin = isValidAsin(item.asin) ? item.asin.trim().toUpperCase() : null;

    return NextResponse.json({
      ok: true,
      link_type: "product",
      asin,
      title: typeof title === "string" ? title : null,
      affiliate_url: affiliateUrl,
      image_url: typeof imageUrl === "string" ? imageUrl : null,
      price: price ?? null,
      partner_tag: PARTNER_TAG,
      marketplace: MARKETPLACE
    });
  } catch (error) {
    console.error("product endpoint error", error);
    return fallbackResponse(keywords, "creators_api_unavailable");
  }
}
