import type { OperatorModelPlan } from "./operatorClosure";
import type { OperatorToolReceipt } from "./operatorTools";

export const WORKER_HARNESS = "closure-native-v1";

export function workerIdleResult() {
  return { ok: true as const, idle: true as const, status: "idle" as const, harness: WORKER_HARNESS };
}

export function workerBlockedResult(input: {
  run_id: number;
  blocked_on: string;
  plan?: OperatorModelPlan | null;
  closure?: unknown;
  cycle?: unknown;
  strategy_report?: unknown;
  reason?: string;
}) {
  return {
    ok: true as const,
    idle: false as const,
    status: "blocked" as const,
    harness: WORKER_HARNESS,
    run_id: input.run_id,
    blocked_on: input.blocked_on,
    feature_progress: false as const,
    plan: input.plan ?? null,
    closure: input.closure ?? null,
    cycle: input.cycle ?? null,
    strategy_report: input.strategy_report ?? null,
    reason: input.reason ?? null
  };
}

export function workerCompletedResult(input: {
  run_id: number;
  receipt?: OperatorToolReceipt | null;
  plan?: OperatorModelPlan | null;
  closure?: unknown;
  cycle?: unknown;
  strategy_report?: unknown;
  blocked_on?: string | null;
  feature_progress?: boolean;
}) {
  return {
    ok: true as const,
    idle: false as const,
    status: "completed" as const,
    harness: WORKER_HARNESS,
    run_id: input.run_id,
    receipt: input.receipt ?? null,
    plan: input.plan ?? null,
    closure: input.closure ?? null,
    cycle: input.cycle ?? null,
    strategy_report: input.strategy_report ?? null,
    feature_progress: input.feature_progress === true,
    blocked_on: input.blocked_on ?? null
  };
}
