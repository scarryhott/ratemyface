import { NextRequest, NextResponse } from "next/server";
import {
  completeReferenceComparison,
  createReferenceComparison,
  readReferenceComparisons,
  recordReferenceObservation
} from "../../../lib/personalIntelligence";
import {
  positiveId,
  validateReferenceDefinition,
  validateReferenceObservation
} from "../../../lib/personalIntelligenceEvidence";
import { runMeteredPersonalIntelligenceAction } from "../../../lib/personalIntelligenceRoute";
import { currentOAuthUser } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type ReferenceOperation = "create" | "record_observation" | "complete";

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Reference Comparison requires sign-in." }, { status: 401 });
  }
  const rawId = request.nextUrl.searchParams.get("comparison_id");
  const comparisonId = rawId == null ? null : positiveId(rawId);
  if (rawId != null && !comparisonId) {
    return NextResponse.json({ ok: false, error: "invalid_comparison_id" }, { status: 400 });
  }
  const limit = Number(request.nextUrl.searchParams.get("limit") || 20);
  return runMeteredPersonalIntelligenceAction(user.id, "reference_comparison:read", async () => {
    const comparisons = await readReferenceComparisons(user.id, { comparison_id: comparisonId, limit });
    return {
      body: {
        ok: true,
        ...(comparisonId == null ? { comparisons } : { comparison: comparisons[0] || null })
      }
    };
  });
}

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "oauth_required", message: "Reference Comparison requires sign-in." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const operation = body.operation as ReferenceOperation;
  if (operation !== "create" && operation !== "record_observation" && operation !== "complete") {
    return NextResponse.json({ ok: false, error: "invalid_operation" }, { status: 400 });
  }
  if (body.consent_reference !== true) {
    return NextResponse.json(
      { ok: false, error: "consent_reference_required", message: "Reference writes require consent_reference=true." },
      { status: 400 }
    );
  }
  const validation =
    operation === "create"
      ? validateReferenceDefinition(body)
      : operation === "record_observation"
        ? validateReferenceObservation(body)
        : positiveId(body.comparison_id)
          ? ({ ok: true, value: { comparison_id: positiveId(body.comparison_id)! } } as const)
          : ({ ok: false, error: "invalid_comparison_id", message: "comparison_id must be a positive integer." } as const);
  if (!validation.ok) return NextResponse.json(validation, { status: 400 });
  return runMeteredPersonalIntelligenceAction(user.id, `reference_comparison:${operation}`, async () => {
    const result =
      operation === "create"
        ? await createReferenceComparison(user.id, validation.value as { title: string; reference_label: string; metric_label: string })
        : operation === "record_observation"
          ? await recordReferenceObservation(
              user.id,
              validation.value as {
                comparison_id: number;
                self_score: number;
                reference_score: number;
                note: string | null;
                observed_at: string | null;
              }
            )
          : await completeReferenceComparison(user.id, body.comparison_id);
    return {
      body: result as unknown as Record<string, unknown>,
      status: result.ok ? 200 : result.error === "comparison_not_found" ? 404 : 409
    };
  });
}
