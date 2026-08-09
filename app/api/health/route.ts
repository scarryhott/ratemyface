import { NextResponse } from "next/server";
import { databaseConfigured } from "../../../lib/db";

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
    partner_tag: "ratemyface0a-20"
  });
}
