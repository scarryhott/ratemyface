import { NextResponse } from "next/server";
import { databaseConfigured } from "../../../lib/db";
import { stripePriceConfigured, stripeSecretConfigured, stripeWebhookConfigured } from "../../../lib/stripeBilling";

export async function GET() {
  const amazonConfigured = Boolean(
    process.env.AMAZON_CREATORS_CLIENT_ID && process.env.AMAZON_CREATORS_CLIENT_SECRET
  );
  const actionAuthConfigured = Boolean(process.env.GPT_ACTION_SECRET);

  return NextResponse.json({
    ok: true,
    service: "ratemyface",
    amazon_configured: amazonConfigured,
    action_auth_configured: actionAuthConfigured,
    database_configured: databaseConfigured(),
    stripe_secret_configured: stripeSecretConfigured(),
    stripe_price_configured: stripePriceConfigured(),
    stripe_webhook_configured: stripeWebhookConfigured(),
    partner_tag: "ratemyface0a-20"
  });
}
