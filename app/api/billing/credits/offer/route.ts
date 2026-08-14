import { NextResponse } from "next/server";
import {
  creditsPerPack,
  creditsPriceId,
  stripe,
  stripeCreditsPriceConfigured,
  stripeSecretConfigured
} from "../../../../../lib/stripeBilling";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  if (!stripeSecretConfigured() || !stripeCreditsPriceConfigured()) {
    return NextResponse.json({ ok: false, error: "credit_checkout_not_configured" }, { status: 503 });
  }

  try {
    const price = await stripe().prices.retrieve(creditsPriceId());
    if (!price.active || price.type !== "one_time" || price.unit_amount == null) {
      return NextResponse.json({ ok: false, error: "credit_offer_unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      {
        ok: true,
        credits: creditsPerPack(),
        unit_amount: price.unit_amount,
        currency: price.currency
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        }
      }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "credit_offer_unavailable" }, { status: 502 });
  }
}
