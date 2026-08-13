/** Whole GitHub tool budget. Per-request abort is also 8s; sequential calls must not stack to 45s. */
export const GITHUB_TOOL_TIMEOUT_MS = 8_000;

export class GithubToolTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly code = "GITHUB_TOOL_TIMEOUT";
  constructor(timeoutMs: number = GITHUB_TOOL_TIMEOUT_MS) {
    super(`github_timeout_${timeoutMs}ms`);
    this.name = "GithubToolTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isGithubToolTimeoutError(error: unknown): boolean {
  if (error instanceof GithubToolTimeoutError) return true;
  if (!error || typeof error !== "object") {
    return typeof error === "string" && /github_timeout/i.test(error);
  }
  const e = error as { code?: string; name?: string; message?: string };
  return e.code === "GITHUB_TOOL_TIMEOUT" || e.name === "GithubToolTimeoutError" || /github_timeout/i.test(String(e.message || ""));
}

export async function withGithubToolTimeout<T>(
  work: () => Promise<T>,
  ms: number = GITHUB_TOOL_TIMEOUT_MS
): Promise<T> {
  const budget = Math.max(20, Math.min(Math.trunc(ms), GITHUB_TOOL_TIMEOUT_MS));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const running = Promise.resolve().then(work);
  void running.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GithubToolTimeoutError(budget)), budget);
  });
  try {
    return await Promise.race([running, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
