import { NextResponse } from "next/server";
import { compareDisabledResponse } from "../../../../lib/compareFeature";

export const runtime = "nodejs";

/** Thin stub for future job listing/create — always 503 while disabled. */
export async function GET() {
  const { status, body } = compareDisabledResponse(503);
  return NextResponse.json(body, { status });
}

export async function POST() {
  const { status, body } = compareDisabledResponse(503);
  return NextResponse.json(body, { status });
}
