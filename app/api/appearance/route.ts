import { NextRequest, NextResponse } from "next/server";
import {
  APPEARANCE_ACTION_COST,
  APPEARANCE_AGENT,
  APPEARANCE_PLAN_ACTION,
  requiredAppearanceHistory
} from "../../../lib/appearanceAgent";
import { readAppearanceHistorySnapshot, runAuthenticatedAppearancePlan } from "../../../lib/appearanceJobs";
import {
  APPEARANCE_ACTION_TIMEOUT_MS,
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
 * Paid Appearance plan OpenAPI Action (appearancePlan).
 * Unauthenticated callers get 401 (not a free anonymous product).
 */

function creditsDenied(balance: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "credits_required",
      message:
        "Appearance plan uses metered credits. Buy credits with createCreditCheckoutSession, then retry.",
      required_credits: APPEARANCE_ACTION_COST,
      balance,
      checkout_action: "createCreditCheckoutSession",
      action: APPEARANCE_PLAN_ACTION
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
        message: "Appearance Agent is a paid authenticated Action. Sign in, then retry."
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    enabled: APPEARANCE_AGENT.enabled,
    status: APPEARANCE_AGENT.status,
    action: APPEARANCE_PLAN_ACTION,
    credits: { action: APPEARANCE_PLAN_ACTION, cost: APPEARANCE_ACTION_COST },
    requires: ["oauth", "credits", "consent_appearance=true", "account_learning", "compare_history"],
    target_days: APPEARANCE_AGENT.target_days,
    note: APPEARANCE_AGENT.note
  });
}

export async function POST(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "oauth_required",
        message: "Appearance Agent is a paid authenticated Action. Sign in, then retry."
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.consent_appearance !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "consent_appearance_required",
        message: "Appearance plan requires explicit consent_appearance=true."
      },
      { status: 400 }
    );
  }

  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  try {
    return await withDatabaseTimeout(async () => {
      const snapshot = await readAppearanceHistorySnapshot(user.id);
      if (!snapshot.active_plan) {
        const historyOk = requiredAppearanceHistory(snapshot);
        if (!historyOk.ok) {
          return NextResponse.json(
            { ok: false, error: historyOk.error, message: historyOk.message },
            { status: 400 }
          );
        }
      }

      await ensureSignupCreditGrant(user.id);
      const charged = await consumeCredits(user.id, APPEARANCE_ACTION_COST, APPEARANCE_PLAN_ACTION);
      if (!charged.ok) return creditsDenied(charged.balance);

      const result = await runAuthenticatedAppearancePlan(user.id, { goal: body.goal });
      if (!result.ok) {
        const status =
          result.error === "no_account_learning_history" ||
          result.error === "no_compare_history" ||
          result.error === "appearance_plan_required"
            ? 400
            : result.error === "appearance_schema_missing" || result.error === "database_not_configured"
              ? 503
              : 500;
        return NextResponse.json(
          {
            ...result,
            enabled: APPEARANCE_AGENT.enabled,
            credits_charged: APPEARANCE_ACTION_COST,
            credits_remaining: await creditBalance(user.id)
          },
          { status }
        );
      }

      return NextResponse.json({
        ok: true,
        enabled: APPEARANCE_AGENT.enabled,
        status: APPEARANCE_AGENT.status,
        action: APPEARANCE_PLAN_ACTION,
        user_id: user.id,
        operation: result.operation,
        reused_existing: result.reused_existing,
        plan: result.plan,
        honest: result.honest,
        follow_up: result.follow_up,
        snapshot: result.snapshot,
        credits_charged: APPEARANCE_ACTION_COST,
        credits_remaining: await creditBalance(user.id),
        note: APPEARANCE_AGENT.note
      });
    }, APPEARANCE_ACTION_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message: "Appearance plan did not complete in time. Check rmf_credit_ledger before retrying.",
          timeout_ms: APPEARANCE_ACTION_TIMEOUT_MS,
          enabled: APPEARANCE_AGENT.enabled
        },
        { status: 504 }
      );
    }
    throw error;
  }
}
