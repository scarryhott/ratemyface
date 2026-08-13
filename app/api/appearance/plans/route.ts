import { NextRequest, NextResponse } from "next/server";
import {
  APPEARANCE_ACTION_COST,
  APPEARANCE_AGENT,
  APPEARANCE_CHECKIN_ACTION,
  requiredAppearanceHistory
} from "../../../../lib/appearanceAgent";
import {
  listAppearancePlans,
  readAppearanceHistorySnapshot,
  runAuthenticatedAppearanceCheckin
} from "../../../../lib/appearanceJobs";
import {
  APPEARANCE_ACTION_TIMEOUT_MS,
  databaseConfigured,
  isDatabaseTimeoutError,
  withDatabaseTimeout
} from "../../../../lib/db";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "../../../../lib/stripeBilling";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

export const runtime = "nodejs";
/** Platform backstop only — the handler must still fail fast via withDatabaseTimeout. */
export const maxDuration = 30;

/**
 * Paid Appearance check-in OpenAPI Action (appearanceCheckin) on POST.
 * GET lists the caller's plans (OAuth, not an OpenAPI Action, not a free product).
 */

function creditsDenied(balance: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "credits_required",
      message:
        "Appearance check-in uses metered credits. Buy credits with createCreditCheckoutSession, then retry.",
      required_credits: APPEARANCE_ACTION_COST,
      balance,
      checkout_action: "createCreditCheckoutSession",
      action: APPEARANCE_CHECKIN_ACTION
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

  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  try {
    return await withDatabaseTimeout(async () => {
      const listed = await listAppearancePlans(user.id);
      return NextResponse.json({
        ok: true,
        enabled: APPEARANCE_AGENT.enabled,
        status: APPEARANCE_AGENT.status,
        action: APPEARANCE_CHECKIN_ACTION,
        credits: { action: APPEARANCE_CHECKIN_ACTION, cost: APPEARANCE_ACTION_COST },
        plans: listed.plans,
        checkins: listed.checkins,
        note: APPEARANCE_AGENT.note
      });
    }, APPEARANCE_ACTION_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message: "Appearance plan listing did not complete in time.",
          timeout_ms: APPEARANCE_ACTION_TIMEOUT_MS,
          enabled: APPEARANCE_AGENT.enabled
        },
        { status: 504 }
      );
    }
    throw error;
  }
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
        message: "Appearance check-in requires explicit consent_appearance=true."
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
      const historyOk = requiredAppearanceHistory(snapshot);
      if (!historyOk.ok) {
        return NextResponse.json(
          { ok: false, error: historyOk.error, message: historyOk.message },
          { status: 400 }
        );
      }
      const requestedId = Number(body.plan_id);
      const hasPlan =
        snapshot.active_plan != null ||
        (Number.isFinite(requestedId) && requestedId > 0);
      if (!hasPlan) {
        return NextResponse.json(
          {
            ok: false,
            error: "appearance_plan_required",
            message: "No appearance plan on this account. Call appearancePlan first. Nothing was invented."
          },
          { status: 400 }
        );
      }

      await ensureSignupCreditGrant(user.id);
      const charged = await consumeCredits(user.id, APPEARANCE_ACTION_COST, APPEARANCE_CHECKIN_ACTION);
      if (!charged.ok) return creditsDenied(charged.balance);

      const result = await runAuthenticatedAppearanceCheckin(user.id, { plan_id: body.plan_id });
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
        action: APPEARANCE_CHECKIN_ACTION,
        user_id: user.id,
        operation: result.operation,
        plan: result.plan,
        checkin: result.checkin,
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
          message: "Appearance check-in did not complete in time. Check rmf_credit_ledger before retrying.",
          timeout_ms: APPEARANCE_ACTION_TIMEOUT_MS,
          enabled: APPEARANCE_AGENT.enabled
        },
        { status: 504 }
      );
    }
    throw error;
  }
}
