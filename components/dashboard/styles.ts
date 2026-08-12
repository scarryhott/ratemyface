import type { CSSProperties } from "react";

export const sectionTitle: CSSProperties = { marginTop: 28, marginBottom: 10, fontSize: 20 };
export const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
  gap: 12
};
export const grid2: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
  gap: 12
};
export const funnelRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  padding: "10px 0",
  borderBottom: "1px solid #eee"
};
export const activity: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "11px 0",
  borderBottom: "1px solid #eee",
  alignItems: "flex-start"
};
export const pill: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 650,
  background: "#f2f4f7"
};
export const button: CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #111",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  cursor: "pointer"
};
export const secondaryButton: CSSProperties = { ...button, background: "white", color: "#111" };
export const dangerButton: CSSProperties = {
  ...button,
  background: "#fff",
  color: "#b42318",
  borderColor: "#f04438"
};
export const linkButton: CSSProperties = { ...button, textDecoration: "none", display: "inline-block" };
export const input: CSSProperties = {
  flex: 1,
  minWidth: 220,
  padding: "10px 12px",
  border: "1px solid #bbb",
  borderRadius: 8
};
export const navTabs: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 16,
  marginBottom: 8
};
export const tabLink: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600
};

export function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export function num(value: unknown) {
  return Number(value || 0).toLocaleString();
}

export function text(value: unknown, fallback = "—") {
  return value == null || value === "" ? fallback : String(value);
}
