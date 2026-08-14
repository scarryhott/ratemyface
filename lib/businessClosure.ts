export type ClosureState = "closed" | "unresolved" | "external_financial" | "protected";

export type ClosureComponent = {
  key: "identity" | "features" | "gpt_factory" | "monitor" | "money" | "protected";
  state: ClosureState;
  evidence: string[];
  next_action: string | null;
};

export type BusinessClosure = {
  closed: boolean;
  components: ClosureComponent[];
  unresolved: ClosureComponent[];
  next_action: ClosureComponent | null;
};

type Feature = {
  feature_key: string;
  lifecycle_status: string;
  access_status: string;
  evidence_status: string;
};

export type ClosureInput = {
  features: Feature[];
  agents: Array<{ auth_user_linked: boolean; feature_access: string; last_verified_at: string | null }>;
  gpt_factory: {
    protected_gpt: { creator_mode: string; factory_enabled: boolean; instruction_hash: string };
    factory_enabled_specs: number;
    completed: number;
  };
  monetary_snapshots: Array<{ source: string; metric_key: string; numeric_value: string | null }>;
};

const CORE_FEATURES = [
  "account_learning",
  "compare_me_to_me",
  "appearance_agent",
  "personal_experiments",
  "personal_intelligence"
];

function component(
  key: ClosureComponent["key"],
  state: ClosureState,
  evidence: string[],
  next_action: string | null
): ClosureComponent {
  return { key, state, evidence, next_action };
}

/**
 * Computes the business closure frontier before an agent chooses work. A
 * repository or deployment fact is input evidence only; closure requires the
 * relevant end-to-end state. Financial closure is deliberately observable but
 * never admitted for autonomous action.
 */
export function evaluateBusinessClosure(input: ClosureInput): BusinessClosure {
  const featureByKey = new Map(input.features.map((feature) => [feature.feature_key, feature]));
  const missingCore = CORE_FEATURES.filter((key) => {
    const feature = featureByKey.get(key);
    return !feature || feature.lifecycle_status !== "active" || feature.access_status !== "available" || feature.evidence_status !== "verified";
  });
  const identityLinked = input.agents.some(
    (agent) => agent.auth_user_linked && agent.feature_access === "full_authorized" && Boolean(agent.last_verified_at)
  );
  const protectedGpt = input.gpt_factory.protected_gpt;
  const protectedClosed = protectedGpt.creator_mode === "human_only" && !protectedGpt.factory_enabled && Boolean(protectedGpt.instruction_hash);
  const monitor = featureByKey.get("feature_monitor_adder");
  const monitorClosed = Boolean(monitor && monitor.lifecycle_status === "active" && monitor.evidence_status === "verified");
  const factoryClosed = input.gpt_factory.completed > 0;
  const purchase = input.monetary_snapshots.find((metric) =>
    (metric.source === "product_credits" && metric.metric_key === "lifetime_purchased") ||
    (metric.source === "product" && metric.metric_key === "credits.lifetime_purchased")
  );
  const paidClosureObserved = Number(purchase?.numeric_value || 0) > 0;

  const components: ClosureComponent[] = [
    component(
      "identity",
      identityLinked ? "closed" : "unresolved",
      identityLinked ? ["An agent identity is linked, entitled, and recently verified."] : ["No linked, recently verified full-feature agent identity."],
      identityLinked ? null : "Close the Codex identity and full authorized-feature acceptance path."
    ),
    component(
      "features",
      missingCore.length ? "unresolved" : "closed",
      missingCore.length ? [`Core feature evidence is incomplete: ${missingCore.join(", ")}.`] : ["Every core paid feature is active, available, and evidence-verified."],
      missingCore.length ? "Verify the first incomplete core feature through its closest user path." : null
    ),
    component(
      "gpt_factory",
      factoryClosed ? "closed" : "unresolved",
      factoryClosed ? ["At least one non-protected GPT factory job has completed."] : ["No completed non-protected GPT factory job receipt."],
      factoryClosed ? null : "Close one non-protected GPT factory create → validate → acceptance-receipt path."
    ),
    component(
      "monitor",
      monitorClosed ? "closed" : "unresolved",
      monitorClosed ? ["Feature monitor/adder is active with verified evidence."] : ["Feature monitor/adder lacks an active verified receipt."],
      monitorClosed ? null : "Run one delta-triggered feature-monitor cycle and persist its verified receipt."
    ),
    component(
      "money",
      paidClosureObserved ? "closed" : "external_financial",
      paidClosureObserved ? ["Observed purchased credits prove a financial event exists."] : ["No observed purchased-credit receipt; financial actions are not agent-admitted."],
      paidClosureObserved ? null : "Await an owner/customer-initiated payment, then verify credit grant, paid use, receipt, and dashboard update."
    ),
    component(
      "protected",
      protectedClosed ? "protected" : "unresolved",
      protectedClosed ? ["Protected GPT is human-only, factory-disabled, and represented by a hash."] : ["Protected asset invariant is not satisfied."],
      protectedClosed ? null : "Stop: protected instruction invariant requires owner intervention."
    )
  ];
  const unresolved = components.filter((item) => item.state === "unresolved" || item.state === "external_financial");
  return {
    closed: unresolved.length === 0 && protectedClosed,
    components,
    unresolved,
    next_action: components.find((item) => item.state === "unresolved") || components.find((item) => item.state === "external_financial") || null
  };
}
