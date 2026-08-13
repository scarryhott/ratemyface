/**
 * Operator signal queue policy.
 *
 * A stale running run must not recycle the same signal forever.
 * Old manual / heartbeat / control_probe items must not starve the
 * current execution-bearing business_improve cycle.
 * Closed rows are kept for audit — never deleted.
 */

export const SIGNAL_MAX_ATTEMPTS = 3;
export const STALE_RUNNING_MS = 2 * 60 * 1000;
export const EXECUTION_BEARING_KIND = "business_improve";

export type QueueFailReason = "stale_exhausted" | "quarantined_legacy" | "superseded";

export type QueueSignal = {
  id: number;
  kind: string;
  status: string;
  attempt_count: number;
  created_at: string;
  started_at: string | null;
  total_runs: number;
  stale_timeout_runs: number;
};

export type QueueClose = { id: number; reason: QueueFailReason };

export type QueueMaintenancePlan = {
  close: QueueClose[];
  requeue: number[];
  claimId: number | null;
};

export function effectiveAttemptCount(
  signal: Pick<QueueSignal, "attempt_count" | "total_runs">
): number {
  return Math.max(Math.trunc(signal.attempt_count || 0), Math.trunc(signal.total_runs || 0));
}

export function isExecutionBearingKind(kind: string): boolean {
  return kind === EXECUTION_BEARING_KIND;
}

export function isStaleRunning(
  signal: Pick<QueueSignal, "status" | "started_at">,
  now: Date,
  staleAfterMs = STALE_RUNNING_MS
): boolean {
  if (signal.status !== "running") return false;
  const started = signal.started_at ? Date.parse(String(signal.started_at)) : NaN;
  if (!Number.isFinite(started)) return true;
  return now.getTime() - started >= staleAfterMs;
}

export function canRetryAfterStale(signal: QueueSignal): boolean {
  return isExecutionBearingKind(signal.kind) && effectiveAttemptCount(signal) < SIGNAL_MAX_ATTEMPTS;
}

function newestEligibleBusinessImprove(signals: QueueSignal[]): QueueSignal | null {
  return (
    signals
      .filter(
        (signal) =>
          signal.status === "queued" &&
          isExecutionBearingKind(signal.kind) &&
          effectiveAttemptCount(signal) < SIGNAL_MAX_ATTEMPTS
      )
      .sort((a, b) => {
        const byCreated = Date.parse(b.created_at) - Date.parse(a.created_at);
        if (byCreated !== 0) return byCreated;
        return b.id - a.id;
      })[0] || null
  );
}

/**
 * Bounded operator maintenance: close leftover stale/legacy queue items,
 * optionally requeue an eligible business_improve, then pick the claim.
 */
export function planQueueMaintenance(
  signals: QueueSignal[],
  now: Date = new Date(),
  staleAfterMs = STALE_RUNNING_MS
): QueueMaintenancePlan {
  const close = new Map<number, QueueFailReason>();
  const requeue: number[] = [];
  const working = signals.map((signal) => ({ ...signal }));

  for (const signal of working) {
    if (!isStaleRunning(signal, now, staleAfterMs)) continue;
    if (canRetryAfterStale(signal)) {
      signal.status = "queued";
      signal.started_at = null;
      requeue.push(signal.id);
    } else {
      signal.status = "failed";
      close.set(signal.id, "stale_exhausted");
    }
  }

  const newestBi = newestEligibleBusinessImprove(working);

  for (const signal of working) {
    if (signal.status !== "queued") continue;
    if (effectiveAttemptCount(signal) >= SIGNAL_MAX_ATTEMPTS) {
      signal.status = "failed";
      close.set(signal.id, "stale_exhausted");
      continue;
    }
    if (signal.stale_timeout_runs > 0 && !canRetryAfterStale(signal)) {
      signal.status = "failed";
      close.set(signal.id, "stale_exhausted");
      continue;
    }
    if (newestBi && signal.id < newestBi.id) {
      signal.status = "failed";
      close.set(
        signal.id,
        isExecutionBearingKind(signal.kind) ? "superseded" : "quarantined_legacy"
      );
    }
  }

  const claimable = working
    .filter(
      (signal) => signal.status === "queued" && effectiveAttemptCount(signal) < SIGNAL_MAX_ATTEMPTS
    )
    .sort((a, b) => {
      const priority = Number(isExecutionBearingKind(a.kind)) - Number(isExecutionBearingKind(b.kind));
      if (priority !== 0) return -priority;
      const byCreated = Date.parse(b.created_at) - Date.parse(a.created_at);
      if (byCreated !== 0) return byCreated;
      return b.id - a.id;
    });

  return {
    close: [...close.entries()].map(([id, reason]) => ({ id, reason })),
    requeue: requeue.filter((id) => !close.has(id)),
    claimId: claimable[0]?.id ?? null
  };
}
