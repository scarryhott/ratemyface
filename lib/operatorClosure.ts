import {
  type Authority,
  type OperatorToolName,
  getOperatorToolRegistry,
  getOperatorToolSpec
} from "./operatorTools";

export interface OperatorCandidate {
  id: string;
  tool: OperatorToolName;
  authority: Authority;
  intent: string;
  reason: string;
  expected_return: string;
  reversible: boolean;
  invariants: string[];
  args: Record<string, unknown>;
}

export interface OperatorModelPlan {
  summary: string;
  observations: string[];
  candidates: OperatorCandidate[];
  required_authority: Authority;
  requires_human_approval: boolean;
  verification: string[];
}

export interface CandidateEvaluation {
  candidate: OperatorCandidate;
  tool_authority: Authority | null;
  configured: boolean;
  admitted: boolean;
  reversible: boolean;
  verifiable: boolean;
  closed: boolean;
  reasons: string[];
}

export interface ClosureDecision {
  harness: "closure-native-v1";
  state: "execute" | "awaiting_approval" | "halted";
  selected: OperatorCandidate | null;
  evaluations: CandidateEvaluation[];
  required_authority: Authority;
  reason: string;
  self_limit: string;
}

function authority(value: unknown, fallback: Authority = 1): Authority {
  const n = Math.max(0, Math.min(6, Number(value ?? fallback)));
  return (Number.isFinite(n) ? Math.trunc(n) : fallback) as Authority;
}

function strings(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isToolName(value: string): value is OperatorToolName {
  return Boolean(getOperatorToolSpec(value));
}

function normalizeCandidate(value: unknown, index: number): OperatorCandidate | null {
  const raw = record(value);
  const toolValue = String(raw.tool || "").trim();
  if (!isToolName(toolValue)) return null;
  const spec = getOperatorToolSpec(toolValue);
  if (!spec) return null;

  return {
    id: String(raw.id || `candidate-${index + 1}`).slice(0, 80),
    tool: toolValue,
    authority: authority(raw.authority, spec.authority),
    intent: String(raw.intent || "").slice(0, 1000),
    reason: String(raw.reason || "").slice(0, 2000),
    expected_return: String(raw.expected_return || "").slice(0, 2000),
    reversible: raw.reversible === undefined ? spec.reversible : Boolean(raw.reversible),
    invariants: strings(raw.invariants, 20),
    args: record(raw.args)
  };
}

export function normalizeModelPlan(value: unknown): OperatorModelPlan {
  const raw = record(value);
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates
        .map((candidate, index) => normalizeCandidate(candidate, index))
        .filter((candidate): candidate is OperatorCandidate => Boolean(candidate))
        .slice(0, 8)
    : [];

  return {
    summary: String(raw.summary || "").slice(0, 4000),
    observations: strings(raw.observations, 20),
    candidates,
    required_authority: authority(raw.required_authority, 1),
    requires_human_approval: Boolean(raw.requires_human_approval),
    verification: strings(raw.verification, 20)
  };
}

function tasksetCandidate(signal: any): OperatorCandidate | null {
  if (String(signal?.kind || "") !== "control_probe") return null;
  return {
    id: "control-probe-github-branch",
    tool: "github_branch_diagnostic",
    authority: 2,
    intent: "Demonstrate bounded external control by creating an isolated GitHub branch and one diagnostic receipt without merging or touching the base branch.",
    reason: "The control probe is a deterministic harness taskset used to verify that the operator can act, independently read back the result, and halt.",
    expected_return: "A verified receipt containing base SHA, isolated branch, commit SHA, expected/observed content digests, base-path absence, and rollback reference.",
    reversible: true,
    invariants: [
      "do_not_modify_base_branch",
      "do_not_merge",
      "write_only_agent_runs_diagnostic_artifact",
      "independent_readback_must_match_expected_digest",
      "halt_after_one_mutation"
    ],
    args: {}
  };
}

function evaluate(candidate: OperatorCandidate, admittedAuthority: Authority): CandidateEvaluation {
  const spec = getOperatorToolSpec(candidate.tool);
  const registry = getOperatorToolRegistry();
  const runtime = registry.find((tool) => tool.name === candidate.tool);
  const reasons: string[] = [];

  if (!spec) reasons.push("unknown_tool");
  const required = spec ? (Math.max(spec.authority, candidate.authority) as Authority) : candidate.authority;
  const configured = Boolean(runtime?.configured);
  if (!configured) reasons.push("tool_not_configured");

  const admitted = admittedAuthority >= required;
  if (!admitted) reasons.push(`authority_${required}_required`);

  const reversible = !spec?.mutating || (spec.reversible && candidate.reversible);
  if (!reversible) reasons.push("mutation_not_reversible");

  const verifiable = candidate.expected_return.trim().length > 0 && candidate.invariants.length > 0;
  if (!verifiable) reasons.push("missing_expected_return_or_invariants");

  return {
    candidate: { ...candidate, authority: required },
    tool_authority: spec?.authority ?? null,
    configured,
    admitted,
    reversible,
    verifiable,
    closed: Boolean(spec) && configured && admitted && reversible && verifiable,
    reasons
  };
}

export function resolveClosure(
  signal: any,
  plan: OperatorModelPlan,
  admittedAuthority: Authority
): ClosureDecision {
  const deterministic = tasksetCandidate(signal);
  const candidates = deterministic
    ? [deterministic, ...plan.candidates.filter((candidate) => candidate.tool !== deterministic.tool)]
    : plan.candidates;
  const evaluations = candidates.map((candidate) => evaluate(candidate, admittedAuthority));

  const selectedEvaluation = evaluations.find((candidate) => candidate.closed) || null;
  if (selectedEvaluation) {
    const selected = selectedEvaluation.candidate;
    const explicitControlProbe = String(signal?.kind || "") === "control_probe";
    const payload = record(signal?.payload);
    const ownerApprovedAuthority = authority(payload.owner_approved_authority, 0);
    const auditedApprovalSatisfied = Boolean(payload.owner_approved) && ownerApprovedAuthority >= selected.authority;
    const approvalRequested =
      plan.requires_human_approval && !explicitControlProbe && !auditedApprovalSatisfied;

    if (approvalRequested) {
      return {
        harness: "closure-native-v1",
        state: "awaiting_approval",
        selected,
        evaluations,
        required_authority: selected.authority,
        reason: "model_requested_human_approval",
        self_limit: "No tool is executed until an authenticated approval is recorded and the task is re-queued."
      };
    }

    return {
      harness: "closure-native-v1",
      state: "execute",
      selected,
      evaluations,
      required_authority: selected.authority,
      reason: deterministic
        ? "deterministic_control_probe_closed"
        : auditedApprovalSatisfied
          ? "audited_owner_approval_closed"
          : "first_admissible_candidate_closed",
      self_limit: "Execute exactly one selected tool, independently verify its receipt, record the return, then halt."
    };
  }

  const requiredAuthority = evaluations.reduce<Authority>((current, evaluation) => {
    const candidateAuthority = evaluation.candidate.authority;
    return candidateAuthority > current ? candidateAuthority : current;
  }, plan.required_authority);
  const blockedByAuthority = evaluations.some((evaluation) =>
    evaluation.reasons.some((reason) => reason.startsWith("authority_"))
  );
  const blockedByConfiguration = evaluations.some((evaluation) =>
    evaluation.reasons.includes("tool_not_configured")
  );

  if (blockedByAuthority || plan.required_authority > admittedAuthority) {
    return {
      harness: "closure-native-v1",
      state: "awaiting_approval",
      selected: evaluations[0]?.candidate || null,
      evaluations,
      required_authority: requiredAuthority,
      reason: "authority_not_admitted",
      self_limit: "The proposed action exceeds admitted authority; record an approval request and execute nothing."
    };
  }

  return {
    harness: "closure-native-v1",
    state: "halted",
    selected: null,
    evaluations,
    required_authority: requiredAuthority,
    reason: blockedByConfiguration ? "required_tool_not_configured" : "no_candidate_closed",
    self_limit: "No candidate satisfies the closure invariants; execute nothing and return the blocking evidence."
  };
}
