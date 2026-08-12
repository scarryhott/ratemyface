/** Operator dashboard metrics: never invent numbers — mark unavailable instead. */
export type MetricValue =
  | { available: true; value: number; note?: string }
  | { available: false; reason: string };

export function metric(value: number, note?: string): MetricValue {
  return { available: true, value, note };
}

export function unavailable(reason: string): MetricValue {
  return { available: false, reason };
}

export function formatMetric(m: MetricValue | null | undefined, fallback = "Unavailable"): string {
  if (!m) return fallback;
  if (!m.available) return "Unavailable";
  return Number(m.value).toLocaleString();
}

export function metricNote(m: MetricValue | null | undefined): string {
  if (!m) return "No data";
  if (!m.available) return m.reason;
  return m.note || "";
}
