import { NextResponse } from "next/server";

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
    partner_tag: "ratemyface0a-20"
  });
}
