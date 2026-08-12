"use client";

import type { ReactNode } from "react";
import type { MetricValue } from "../../lib/metricValue";
import { formatMetric, metricNote } from "../../lib/metricValue";

export function MetricCard({
  label,
  metric,
  fallbackNote
}: {
  label: string;
  metric: MetricValue | null | undefined;
  fallbackNote?: string;
}) {
  const available = Boolean(metric?.available);
  const value = formatMetric(metric);
  const note = metricNote(metric) || fallbackNote || "";

  return (
    <div className="card" style={{ minHeight: 122 }}>
      <div className="muted" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: available ? 34 : 22,
          fontWeight: 750,
          margin: "8px 0",
          color: available ? "#111" : "#667085"
        }}
      >
        {value}
      </div>
      <div className="muted">{note}</div>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="muted">{label}</div>
      <strong style={{ fontSize: 24 }}>{Number(value || 0).toLocaleString()}</strong>
    </div>
  );
}

export function StatusCard({ label, state, ok }: { label: string; state: string; ok: boolean }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div style={{ fontWeight: 700, marginTop: 8 }}>{state}</div>
      <div
        style={{
          borderRadius: 999,
          padding: "6px 10px",
          fontSize: 13,
          fontWeight: 650,
          marginTop: 10,
          display: "inline-block",
          background: ok ? "#ecfdf3" : "#fff7ed",
          color: ok ? "#067647" : "#b54708"
        }}
      >
        {ok ? "OK" : "Check"}
      </div>
    </div>
  );
}

export function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div id={id} style={{ marginTop: 28, marginBottom: 10, scrollMarginTop: 24 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
      {subtitle ? (
        <p className="muted" style={{ margin: "6px 0 0", maxWidth: 900 }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function FunnelRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        padding: "10px 0",
        borderBottom: "1px solid #eee"
      }}
    >
      <span>{label}</span>
      <strong style={{ textAlign: "right" }}>{value}</strong>
    </div>
  );
}
