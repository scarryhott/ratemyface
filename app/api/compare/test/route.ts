import { NextRequest, NextResponse } from "next/server";
import {
  COMPARE_ME_TO_ME,
  COMPARE_TEST_ACTION,
  COMPARE_TEST_ACTION_COST,
  compareDisabledResponse
} from "../../../../lib/compareFeature";
import { readCompareLearningSnapshot, runAuthenticatedCompareTest } from "../../../../lib/compareJobs";
import {
  COMPARE_TEST_DB_TIMEOUT_MS,
  databaseConfigured,
  isDatabaseTimeoutError,
  withDatabaseTimeout
} from "../../../../lib/db";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "../../../../lib/stripeBilling";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withDatabaseTimeout. */
export const maxDuration = 30;

/**
 * Authenticated, non-public Compare Me To Me TEST path.
 * Public GPT/OpenAPI stay off — this route is not an Action.
 * Unauthenticated callers get 503 compare_disabled (internal test is not public).
 * Paid OpenAPI Action is POST /api/compare (401 without OAuth).
 */

type ResolvedUser =
  | { ok: true; userId: string; actor: string }
  | { ok: false; status: number; body: Record<string, unknown> };

async function resolveTestUser(request: NextRequest, body: Record<string, unknown>): Promise<ResolvedUser> {
  const oauth = await currentOAuthUser(request);
  if (oauth) return { ok: true, userId: oauth.id, actor: "oauth" };

  const operator = await operatorRequestAuthorized(request);
  if (operator.ok) {
    const userId = String(body.user_id || operator.owner?.id || "").trim();
    if (!userId) {
      return {
        ok: false,
        status: 400,
        body: { ok: false, error: "user_id_required", message: "Operator compare test needs user_id." }
      };
    }
    return { ok: true, userId, actor: operator.actor || "operator" };
  }

  const disabled = compareDisabledResponse(503);
  return { ok: false, status: disabled.status, body: disabled.body };
}

function creditsDenied(balance: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "credits_required",
      message:
        "Authenticated Compare Me To Me test uses metered credits. Buy credits with createCreditCheckoutSession, then retry.",
      required_credits: COMPARE_TEST_ACTION_COST,
      balance,
      checkout_action: "createCreditCheckoutSession",
      action: COMPARE_TEST_ACTION
    },
    { status: 402 }
  );
}

/** Authenticated: describe the test path. Unauthenticated: public 503 stub. */
export async function GET(request: NextRequest) {
  const resolved = await resolveTestUser(request, {});
  if (!resolved.ok) return NextResponse.json(resolved.body, { status: resolved.status });

  return NextResponse.json({
    ok: true,
    enabled: COMPARE_ME_TO_ME.enabled,
    status: COMPARE_ME_TO_ME.status,
    public_api: "401 oauth_required on /api/compare",
    test_path: COMPARE_ME_TO_ME.authenticated_test_path,
    actor: resolved.actor,
    user_id: resolved.userId,
    credits: { action: COMPARE_TEST_ACTION, cost: COMPARE_TEST_ACTION_COST },
    note: COMPARE_ME_TO_ME.note
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const resolved = await resolveTestUser(request, body);
  if (!resolved.ok) return NextResponse.json(resolved.body, { status: resolved.status });

  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  try {
    return await withDatabaseTimeout(async () => {
      const snapshot = await readCompareLearningSnapshot(resolved.userId);
      if (!snapshot.profile && !snapshot.latest_interaction && !snapshot.latest_recommendation) {
        return NextResponse.json(
          {
            ok: false,
            error: "no_account_learning_history",
            message: "No stored profile, interaction, or recommendation to compare from.",
            enabled: COMPARE_ME_TO_ME.enabled
          },
          { status: 409 }
        );
      }

      await ensureSignupCreditGrant(resolved.userId);
      const charged = await consumeCredits(resolved.userId, COMPARE_TEST_ACTION_COST, COMPARE_TEST_ACTION);
      if (!charged.ok) return creditsDenied(charged.balance);

      const consentCompare = body.consent_compare === false ? false : true;
      const consentImageStorage = body.consent_image_storage === true;
      const result = await runAuthenticatedCompareTest(resolved.userId, {
        consent_compare: consentCompare,
        consent_image_storage: consentImageStorage
      });

      if (!result.ok) {
        const status =
          result.error === "no_account_learning_history"
            ? 409
            : result.error === "compare_schema_missing" || result.error === "database_not_configured"
              ? 503
              : 500;
        return NextResponse.json(
          {
            ...result,
            enabled: COMPARE_ME_TO_ME.enabled,
            credits_charged: COMPARE_TEST_ACTION_COST,
            credits_remaining: await creditBalance(resolved.userId)
          },
          { status }
        );
      }

      return NextResponse.json({
        ok: true,
        enabled: COMPARE_ME_TO_ME.enabled,
        status: COMPARE_ME_TO_ME.status,
        public_api: "401 oauth_required on /api/compare",
        actor: resolved.actor,
        user_id: resolved.userId,
        job: result.job,
        result: result.result,
        follow_up: result.follow_up,
        snapshot: result.snapshot,
        credits_charged: COMPARE_TEST_ACTION_COST,
        credits_remaining: await creditBalance(resolved.userId),
        note: "Honest history-placeholder test. Not LIVE photo compare and not a product Action."
      });
    }, COMPARE_TEST_DB_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message:
            "Postgres did not respond in time. Compare test did not complete. Check rmf_credit_ledger before retrying.",
          timeout_ms: COMPARE_TEST_DB_TIMEOUT_MS,
          enabled: COMPARE_ME_TO_ME.enabled
        },
        { status: 504 }
      );
    }
    throw error;
  }
}
