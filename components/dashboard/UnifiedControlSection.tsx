"use client";

import { grid2, grid4, pill, when } from "./styles";

type UnifiedControl = {
  schema_ready: boolean;
  reason: string | null;
  summary: { total: number; active: number; verified: number; blocked: number; gaps: number };
  features: Array<{
    feature_key: string;
    name: string;
    category: string;
    lifecycle_status: string;
    access_status: string;
    monetization_status: string;
    evidence_status: string;
    endpoint: string | null;
    last_verified_at: string | null;
  }>;
  agents: Array<{
    agent_key: string;
    display_name: string;
    role: string;
    status: string;
    feature_access: string;
    auth_user_linked: boolean;
    entitlement_count: number;
    last_verified_at: string | null;
  }>;
  gpt_factory: {
    protected_gpt: {
      gpt_key: string;
      creator_mode: string;
      factory_enabled: false;
      instruction_hash: string;
    };
    factory_enabled_specs: number;
    queued: number;
    running: number;
    awaiting_human: number;
    completed: number;
    failed: number;
  };
  monetary_snapshots: Array<{
    source: string;
    metric_key: string;
    numeric_value: string | null;
    text_value: string | null;
    unit: string;
    observed_at: string;
  }>;
};

function statusTone(status: string) {
  if (["active", "available", "verified", "earning", "completed"].includes(status)) {
    return { background: "#ecfdf3", color: "#067647" };
  }
  if (["blocked", "failed", "revoked"].includes(status)) {
    return { background: "#fef3f2", color: "#b42318" };
  }
  return { background: "#fff7ed", color: "#b54708" };
}

function StatusPill({ value }: { value: string }) {
  return <span style={{ ...pill, ...statusTone(value) }}>{value.replaceAll("_", " ")}</span>;
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="card" style={{ minHeight: 112 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
      <strong style={{ display: "block", fontSize: 34, lineHeight: 1.1, margin: "8px 0 4px" }}>{value}</strong>
      <small className="muted">{note}</small>
    </div>
  );
}

export function UnifiedControlSection({ data }: { data: UnifiedControl }) {
  const protectedGpt = data.gpt_factory.protected_gpt;
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#b54708", fontWeight: 750, letterSpacing: 0.7, textTransform: "uppercase", fontSize: 12 }}>
            Unified business control plane
          </p>
          <h2 style={{ margin: "6px 0 4px", fontSize: 26 }}>Features, access, GPT factory, and money evidence</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 780 }}>
            Database state and verification receipts are authoritative. Activity without evidence remains a gap.
          </p>
        </div>
        <StatusPill value={data.schema_ready ? "database_ready" : "schema_pending"} />
      </div>

      {!data.schema_ready && (
        <div className="card" style={{ marginTop: 16, borderColor: "#f79009", background: "#fffcf5" }}>
          <strong>Control-plane migration pending</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            {data.reason || "The dashboard is showing repository seeds until the database schema is applied."}
          </p>
        </div>
      )}

      <div style={{ ...grid4, marginTop: 16 }}>
        <SummaryCard label="Registered" value={data.summary.total} note="Unified feature requirements" />
        <SummaryCard label="Active" value={data.summary.active} note="Lifecycle state only" />
        <SummaryCard label="Verified" value={data.summary.verified} note="Closed by evidence receipt" />
        <SummaryCard label="Open gaps" value={data.summary.gaps} note={`${data.summary.blocked} explicitly blocked`} />
      </div>

      <div style={{ ...grid2, marginTop: 16 }}>
        <div className="card" style={{ borderTop: "4px solid #111" }}>
          <h3 style={{ marginTop: 0 }}>Agent access</h3>
          {data.agents.map((agent) => (
            <div key={agent.agent_key} style={{ padding: "11px 0", borderBottom: "1px solid #eaecf0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong>{agent.display_name}</strong>
                <StatusPill value={agent.status} />
              </div>
              <p className="muted" style={{ margin: "7px 0 0" }}>
                {agent.role} · access {agent.feature_access} · account {agent.auth_user_linked ? "linked" : "not linked"} · {agent.entitlement_count} entitlements
              </p>
            </div>
          ))}
          {!data.agents.length && <p className="muted">No agent identities registered.</p>}
        </div>

        <div className="card" style={{ borderTop: "4px solid #b42318" }}>
          <h3 style={{ marginTop: 0 }}>GPT factory boundary</h3>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>Rate My Face GPT</strong>
            <StatusPill value="human_only" />
          </div>
          <p className="muted">
            Factory disabled permanently. The control plane stores only the protected asset hash ({protectedGpt.instruction_hash.slice(0, 12)}...), never its handwritten words.
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>{data.gpt_factory.factory_enabled_specs}</strong> factory specs · <strong>{data.gpt_factory.queued}</strong> queued · <strong>{data.gpt_factory.running}</strong> running · <strong>{data.gpt_factory.awaiting_human}</strong> awaiting human · <strong>{data.gpt_factory.completed}</strong> completed · <strong>{data.gpt_factory.failed}</strong> failed
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Feature monitor</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #d0d5dd" }}>
              <th style={{ padding: "10px 8px" }}>Feature</th>
              <th style={{ padding: "10px 8px" }}>Lifecycle</th>
              <th style={{ padding: "10px 8px" }}>Access</th>
              <th style={{ padding: "10px 8px" }}>Money</th>
              <th style={{ padding: "10px 8px" }}>Evidence</th>
              <th style={{ padding: "10px 8px" }}>Last verified</th>
            </tr>
          </thead>
          <tbody>
            {data.features.map((feature) => (
              <tr key={feature.feature_key} style={{ borderBottom: "1px solid #eaecf0" }}>
                <td style={{ padding: "12px 8px" }}>
                  <strong>{feature.name}</strong>
                  <div className="muted"><code>{feature.feature_key}</code> · {feature.category}</div>
                </td>
                <td style={{ padding: "12px 8px" }}><StatusPill value={feature.lifecycle_status} /></td>
                <td style={{ padding: "12px 8px" }}><StatusPill value={feature.access_status} /></td>
                <td style={{ padding: "12px 8px" }}><StatusPill value={feature.monetization_status} /></td>
                <td style={{ padding: "12px 8px" }}><StatusPill value={feature.evidence_status} /></td>
                <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>{when(feature.last_verified_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Monetary evidence ingestion</h3>
        {!data.monetary_snapshots.length ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No unified provider snapshots yet. Existing Stripe credit counts remain visible below, but revenue, compute cost, and infrastructure cost are not treated as interchangeable.
          </p>
        ) : (
          data.monetary_snapshots.slice(0, 12).map((metric) => (
            <div key={`${metric.source}:${metric.metric_key}`} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: "1px solid #eaecf0" }}>
              <span><strong>{metric.source}</strong> · {metric.metric_key}</span>
              <span>{metric.numeric_value ?? metric.text_value} {metric.unit} · {when(metric.observed_at)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
