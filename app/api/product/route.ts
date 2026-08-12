import { NextRequest, NextResponse } from "next/server";
import { actionOrOAuthAuthorized } from "../../../lib/supabaseAuth";

const PARTNER_TAG = "ratemyfacegpt-20";
const MARKETPLACE = "www.amazon.com";

// Amazon Creators API (creatorsapi.amazon / AMAZON_CREATORS_CLIENT_ID+SECRET)
// is not available yet. Re-enable the SearchItems token+fetch path here when it is.
// Until then, always return a tagged /s?k=...&tag=... search fallback.

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

function taggedSearchUrl(keywords: string): string {
  const url = new URL("https://www.amazon.com/s");
  url.searchParams.set("k", keywords);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
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

  // Always use tagged Amazon search until Creators API is available.
  return fallbackResponse(keywords, "creators_api_not_available");
}
