import { NextRequest, NextResponse } from "next/server";
import {
  COMPARE_ACTION,
  COMPARE_ACTION_COST,
  COMPARE_ME_TO_ME
} from "../../../lib/compareFeature";
import { readCompareLearningSnapshot, runAuthenticatedCompare } from "../../../lib/compareJobs";
import { resolveCompareImageRefs } from "../../../lib/compareVision";
import {
  COMPARE_ACTION_TIMEOUT_MS,
  databaseConfigured,
  isDatabaseTimeoutError,
  withDatabaseTimeout
} from "../../../lib/db";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "../../../lib/stripeBilling";
import { currentOAuthUser } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withDatabaseTimeout. */
export const maxDuration = 30;

/**
 * Paid Compare Me To Me OpenAPI Action.
 * Unauthenticated callers get 401 (not a free anonymous product).
 * Job listing remains at /api/compare/jobs (503).
 */

function creditsDenied(balance: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "credits_required",
      message:
        "Compare Me To Me uses metered credits. Buy credits with createCreditCheckoutSession, then retry.",
      required_credits: COMPARE_ACTION_COST,
      balance,
      checkout_action: "createCreditCheckoutSession",
      action: COMPARE_ACTION
    },
    { status: 402 }
  );
}

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "oauth_required",
        message: "Compare Me To Me is a paid authenticated Action. Sign in, then retry."
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    enabled: COMPARE_ME_TO_ME.enabled,
    status: COMPARE_ME_TO_ME.status,
    vision_status: COMPARE_ME_TO_ME.vision_status,
    action: COMPARE_ACTION,
    credits: { action: COMPARE_ACTION, cost: COMPARE_ACTION_COST },
    requires: ["oauth", "credits", "consent_compare=true", "before_image_ref", "after_image_ref"],
    note: COMPARE_ME_TO_ME.note
  });
}

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "oauth_required",
        message: "Compare Me To Me is a paid authenticated Action. Sign in, then retry."
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.consent_compare !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "consent_compare_required",
        message: "Compare Me To Me requires explicit consent_compare=true."
      },
      { status: 400 }
    );
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  try {
    return await withDatabaseTimeout(async () => {
      const snapshot = await readCompareLearningSnapshot(user.id);
      const refs = resolveCompareImageRefs({
        body,
        profile: snapshot.profile
      });
      if (!refs.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: refs.error,
            message: refs.message,
            before_image_ref: refs.before_image_ref,
            after_image_ref: refs.after_image_ref
          },
          { status: 400 }
        );
      }

      await ensureSignupCreditGrant(user.id);
      const charged = await consumeCredits(user.id, COMPARE_ACTION_COST, COMPARE_ACTION);
      if (!charged.ok) return creditsDenied(charged.balance);

      const result = await runAuthenticatedCompare(user.id, {
        consent_compare: true,
        consent_image_storage: body.consent_image_storage === true,
        before_image_ref: refs.before_image_ref,
        after_image_ref: refs.after_image_ref,
        source: refs.source,
        snapshot
      });

      if (!result.ok) {
        const status =
          result.error === "image_refs_required" || result.error === "consent_compare_required"
            ? 400
            : result.error === "compare_schema_missing" || result.error === "database_not_configured"
              ? 503
              : 500;
        return NextResponse.json(
          {
            ...result,
            enabled: COMPARE_ME_TO_ME.enabled,
            credits_charged: COMPARE_ACTION_COST,
            credits_remaining: await creditBalance(user.id)
          },
          { status }
        );
      }

      return NextResponse.json({
        ok: true,
        enabled: COMPARE_ME_TO_ME.enabled,
        status: COMPARE_ME_TO_ME.status,
        vision_status: COMPARE_ME_TO_ME.vision_status,
        action: COMPARE_ACTION,
        user_id: user.id,
        job: result.job,
        result: result.result,
        follow_up: result.follow_up,
        snapshot: result.snapshot,
        credits_charged: COMPARE_ACTION_COST,
        credits_remaining: await creditBalance(user.id),
        note: COMPARE_ME_TO_ME.note
      });
    }, COMPARE_ACTION_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message:
            "Compare did not complete in time. Check rmf_credit_ledger before retrying.",
          timeout_ms: COMPARE_ACTION_TIMEOUT_MS,
          enabled: COMPARE_ME_TO_ME.enabled
        },
        { status: 504 }
      );
    }
    throw error;
  }
}
