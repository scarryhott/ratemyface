import { NextResponse } from "next/server";
import { appearanceAgentDisabledResponse } from "../../../lib/appearanceAgent";

export const runtime = "nodejs";

/**
 * Thin stub — Appearance Agent stays DISABLED.
 * No plan create/get, no coaching loop, no OpenAPI Action.
 * Not LIVE paid coaching.
 */
export async function GET() {
  const { status, body } = appearanceAgentDisabledResponse(503);
  return NextResponse.json(body, { status });
}

export async function POST() {
  const { status, body } = appearanceAgentDisabledResponse(503);
  return NextResponse.json(body, { status });
}
