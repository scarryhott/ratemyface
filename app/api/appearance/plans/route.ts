import { NextResponse } from "next/server";
import { appearanceAgentDisabledResponse } from "../../../../lib/appearanceAgent";

export const runtime = "nodejs";

/**
 * Thin stub for future create/get appearance plans.
 * Always 503 while disabled — draft-only server writes are not exposed yet.
 * Not LIVE paid coaching. No OpenAPI Action until flag + learning + compare ready.
 */
export async function GET() {
  const { status, body } = appearanceAgentDisabledResponse(503);
  return NextResponse.json(body, { status });
}

export async function POST() {
  const { status, body } = appearanceAgentDisabledResponse(503);
  return NextResponse.json(body, { status });
}
