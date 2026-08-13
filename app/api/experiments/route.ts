import { NextRequest, NextResponse } from "next/server";
import {
  PERSONAL_EXPERIMENT_ACTION_COST,
  PERSONAL_EXPERIMENT_READ_ACTION,
  PERSONAL_EXPERIMENTS,
  PERSONAL_EXPERIMENT_WRITE_ACTION,
  validatePersonalExperimentDefinition,
  validatePersonalExperimentOutcome
} from "../../../lib/personalExperimentEvidence";
import {
  completePersonalExperiment,
  createPersonalExperiment,
  personalExperimentTablesReady,
  readPersonalExperiments,
  recordPersonalExperimentOutcome
} from "../../../lib/personalExperiments";
import {
  PERSONAL_EXPERIMENT_ACTION_TIMEOUT_MS,
  databaseConfigured,
  isDatabaseTimeoutError,
  withDatabaseTimeout
} from "../../../lib/db";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "../../../lib/stripeBilling";
import { currentOAuthUser } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

type ExperimentOperation = "create" | "record_outcome" | "complete";

function creditsDenied(balance: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "credits_required",
      message:
        "Personal Experiments use metered credits. Buy credits with createCreditCheckoutSession, then retry.",
      required_credits: PERSONAL_EXPERIMENT_ACTION_COST,
      balance,
      checkout_action: "createCreditCheckoutSession"
    },
    { status: 402 }
  );
}

function mutationErrorStatus(error: string): number {
  if (error === "experiment_not_found") return 404;
  if (error === "experiment_not_active") return 409;
  return 400;
}

function invalidRequest(operation: ExperimentOperation, body: Record<string, unknown>) {
  if (operation === "create") return validatePersonalExperimentDefinition(body);
  if (operation === "record_outcome") return validatePersonalExperimentOutcome(body);
  const id = Number(body.experiment_id);
  return Number.isSafeInteger(id) && id > 0
    ? ({ ok: true, value: id } as const)
    : ({
        ok: false,
        error: "invalid_experiment_id",
        message: "experiment_id must be a positive integer."
      } as const);
}

export async function GET(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "oauth_required", message: "Personal Experiments require sign-in." },
      { status: 401 }
    );
  }
  const rawId = request.nextUrl.searchParams.get("experiment_id");
  const experimentId = rawId == null ? null : Number(rawId);
  if (experimentId != null && (!Number.isSafeInteger(experimentId) || experimentId <= 0)) {
    return NextResponse.json({ ok: false, error: "invalid_experiment_id" }, { status: 400 });
  }
  const limit = Number(request.nextUrl.searchParams.get("limit") || 20);
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  try {
    return await withDatabaseTimeout(async () => {
      if (!(await personalExperimentTablesReady())) {
        return NextResponse.json(
          { ok: false, error: "personal_experiment_schema_missing" },
          { status: 503 }
        );
      }
      await ensureSignupCreditGrant(user.id);
      const charged = await consumeCredits(
        user.id,
        PERSONAL_EXPERIMENT_ACTION_COST,
        PERSONAL_EXPERIMENT_READ_ACTION
      );
      if (!charged.ok) return creditsDenied(charged.balance);
      const experiments = await readPersonalExperiments(user.id, {
        experiment_id: experimentId,
        limit
      });
      return NextResponse.json({
        ok: true,
        enabled: PERSONAL_EXPERIMENTS.enabled,
        status: PERSONAL_EXPERIMENTS.status,
        ...(experimentId == null ? { experiments } : { experiment: experiments[0] || null }),
        credits_charged: PERSONAL_EXPERIMENT_ACTION_COST,
        credits_remaining: await creditBalance(user.id),
        note: PERSONAL_EXPERIMENTS.note
      });
    }, PERSONAL_EXPERIMENT_ACTION_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message: "Personal Experiments did not complete in time. Check the credit ledger before retrying.",
          timeout_ms: PERSONAL_EXPERIMENT_ACTION_TIMEOUT_MS
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
      { ok: false, error: "oauth_required", message: "Personal Experiments require sign-in." },
      { status: 401 }
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const operation = body.operation;
  if (operation !== "create" && operation !== "record_outcome" && operation !== "complete") {
    return NextResponse.json({ ok: false, error: "invalid_operation" }, { status: 400 });
  }
  if (body.consent_experiment !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "consent_experiment_required",
        message: "Personal Experiments require explicit consent_experiment=true before storing evidence."
      },
      { status: 400 }
    );
  }
  const validation = invalidRequest(operation, body);
  if (!validation.ok) {
    return NextResponse.json(validation, { status: 400 });
  }
  if (!databaseConfigured()) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  try {
    return await withDatabaseTimeout(async () => {
      if (!(await personalExperimentTablesReady())) {
        return NextResponse.json(
          { ok: false, error: "personal_experiment_schema_missing" },
          { status: 503 }
        );
      }
      await ensureSignupCreditGrant(user.id);
      const charged = await consumeCredits(
        user.id,
        PERSONAL_EXPERIMENT_ACTION_COST,
        `${PERSONAL_EXPERIMENT_WRITE_ACTION}:${operation}`
      );
      if (!charged.ok) return creditsDenied(charged.balance);
      const result =
        operation === "create"
          ? await createPersonalExperiment(user.id, body)
          : operation === "record_outcome"
            ? await recordPersonalExperimentOutcome(user.id, body)
            : await completePersonalExperiment(user.id, body.experiment_id);
      if (!result.ok) {
        return NextResponse.json(result, { status: mutationErrorStatus(result.error) });
      }
      return NextResponse.json({
        ok: true,
        enabled: PERSONAL_EXPERIMENTS.enabled,
        status: PERSONAL_EXPERIMENTS.status,
        operation: result.operation,
        experiment: result.experiment,
        credits_charged: PERSONAL_EXPERIMENT_ACTION_COST,
        credits_remaining: await creditBalance(user.id),
        note: PERSONAL_EXPERIMENTS.note
      });
    }, PERSONAL_EXPERIMENT_ACTION_TIMEOUT_MS);
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "database_timeout",
          message: "Personal Experiments did not complete in time. Check the credit ledger before retrying.",
          timeout_ms: PERSONAL_EXPERIMENT_ACTION_TIMEOUT_MS
        },
        { status: 504 }
      );
    }
    throw error;
  }
}
