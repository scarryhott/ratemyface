import { NextResponse } from "next/server";
import {
  PERSONAL_INTELLIGENCE_ACTION_TIMEOUT_MS,
  databaseConfigured,
  isDatabaseTimeoutError,
  withDatabaseTimeout
} from "./db";
import { PERSONAL_INTELLIGENCE, PERSONAL_INTELLIGENCE_ACTION_COST } from "./personalIntelligenceEvidence";
import { personalIntelligenceTablesReady } from "./personalIntelligence";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "./stripeBilling";

type ActionResponse = { body: Record<string, unknown>; status?: number };

function creditsDenied(balance: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "credits_required",
      message: "Personal intelligence uses metered credits. Buy credits with createCreditCheckoutSession, then retry.",
      required_credits: PERSONAL_INTELLIGENCE_ACTION_COST,
      balance,
      checkout_action: "createCreditCheckoutSession"
    },
    { status: 402 }
  );
}

export async function runMeteredPersonalIntelligenceAction(
  userId: string,
  action: string,
  work: () => Promise<ActionResponse>
) {
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }
  try {
    return await withDatabaseTimeout(async () => {
      if (!(await personalIntelligenceTablesReady())) {
        return NextResponse.json(
          { ok: false, error: "personal_intelligence_schema_missing" },
          { status: 503 }
        );
      }
      await ensureSignupCreditGrant(userId);
      const charged = await consumeCredits(userId, PERSONAL_INTELLIGENCE_ACTION_COST, action);
      if (!charged.ok) return creditsDenied(charged.balance);
      const result = await work();
      return NextResponse.json(
        {
          ...result.body,
          enabled: PERSONAL_INTELLIGENCE.enabled,
          feature_status: PERSONAL_INTELLIGENCE.status,
          credits_charged: PERSONAL_INTELLIGENCE_ACTION_COST,
          credits_remaining: await creditBalance(userId),
          note: PERSONAL_INTELLIGENCE.note
        },
        { status: result.status || 200 }
      );
    }, PERSONAL_INTELLIGENCE_ACTION_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message: "The personal-intelligence action did not complete in time. Check the credit ledger before retrying.",
          timeout_ms: PERSONAL_INTELLIGENCE_ACTION_TIMEOUT_MS
        },
        { status: 504 }
      );
    }
    throw error;
  }
}
