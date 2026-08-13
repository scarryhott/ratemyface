import { NextResponse } from "next/server";
import { compareDisabledResponse } from "../../../lib/compareFeature";

export const runtime = "nodejs";

/** Thin stub — public feature stays DISABLED. No job enqueue / result reads. Authenticated test is POST /api/compare/test (not this route). */
export async function GET() {
  const { status, body } = compareDisabledResponse(503);
  return NextResponse.json(body, { status });
}

export async function POST() {
  const { status, body } = compareDisabledResponse(503);
  return NextResponse.json(body, { status });
}
