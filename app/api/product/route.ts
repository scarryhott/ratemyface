import { NextRequest, NextResponse } from "next/server";

const PARTNER_TAG = "ratemyface0a-20";
const MARKETPLACE = "www.amazon.com";
const TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SEARCH_URL = "https://creatorsapi.amazon/catalog/v1/searchItems";

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

function authorized(request: NextRequest): boolean {
  const expected = process.env.GPT_ACTION_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) return tokenCache.token;

  const clientId = process.env.AMAZON_CREATORS_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CREATORS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Amazon Creators API credentials are not configured.");
  }

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
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(`Amazon token request failed (${response.status}).`);
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  tokenCache = { token: data.access_token, expiresAt: now + expiresIn * 1000 };
  return data.access_token;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let input: ProductRequest;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const region = clean(input.region || "US", 16).toUpperCase();
  if (!['US', 'USA', 'UNITED STATES'].includes(region)) {
    return NextResponse.json(
      { ok: false, error: "unsupported_region", message: "This deployment currently supports the US Amazon Associates store only." },
      { status: 400 }
    );
  }

  const concern = clean(input.concern);
  const productType = clean(input.product_type);
  const brand = clean(input.brand, 80);
  if (!productType) {
    return NextResponse.json({ ok: false, error: "product_type_required" }, { status: 400 });
  }

  const keywords = [productType, concern].filter(Boolean).join(" ").slice(0, 180);
  const maxPrice = budgetToCents(input.budget);

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
      return NextResponse.json(
        { ok: false, error: "amazon_search_failed", status: amazonResponse.status },
        { status: 502 }
      );
    }

    const items = Array.isArray(data?.searchResult?.items) ? data.searchResult.items : [];
    const item = items.find((candidate: any) => {
      if (!candidate?.asin || !candidate?.detailPageURL) return false;
      try {
        const url = new URL(candidate.detailPageURL);
        return url.hostname.endsWith("amazon.com") && url.searchParams.get("tag") === PARTNER_TAG;
      } catch {
        return false;
      }
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "no_valid_product", message: "Amazon returned no product with a validated affiliate URL." },
        { status: 404 }
      );
    }

    const title = item?.itemInfo?.title?.displayValue;
    const imageUrl = item?.images?.primary?.medium?.url;
    const price = item?.offersV2?.listings?.[0]?.price;

    return NextResponse.json({
      ok: true,
      asin: item.asin,
      title: typeof title === "string" ? title : null,
      affiliate_url: item.detailPageURL,
      image_url: typeof imageUrl === "string" ? imageUrl : null,
      price: price ?? null,
      partner_tag: PARTNER_TAG,
      marketplace: MARKETPLACE
    });
  } catch (error) {
    console.error("product endpoint error", error);
    return NextResponse.json(
      { ok: false, error: "service_not_configured", message: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 503 }
    );
  }
}
