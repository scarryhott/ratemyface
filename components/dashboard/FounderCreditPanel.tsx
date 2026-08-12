"use client";

import { useState } from "react";
import { button, secondaryButton, dangerButton, input, funnelRow, when, num, text } from "./styles";

type CreditAccount = {
  user_id: string;
  balance: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  updated_at?: string | null;
  label?: string;
  recent_ledger?: Array<{
    id: number;
    delta: number;
    balance_after: number;
    reason: string;
    action: string | null;
    external_ref?: string | null;
    created_at: string;
  }>;
};

export function FounderCreditPanel({
  canMutate,
  authHeaders,
  onMutated,
  signupCredits,
  packSize
}: {
  canMutate: boolean;
  authHeaders: () => Headers;
  onMutated: () => Promise<void>;
  signupCredits: number;
  packSize: number;
}) {
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditNote, setCreditNote] = useState("");
  const [creditLookup, setCreditLookup] = useState<CreditAccount | null>(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMessage, setCreditMessage] = useState("");

  async function lookupCredits() {
    const userId = creditUserId.trim();
    if (!userId) {
      setCreditMessage("Enter a user_id (OAuth subject).");
      return;
    }
    setCreditBusy(true);
    setCreditMessage("");
    try {
      const response = await fetch(`/api/operator/credits?user_id=${encodeURIComponent(userId)}`, {
        headers: authHeaders(),
        cache: "no-store",
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setCreditLookup(body.account as CreditAccount);
      setCreditMessage(`Balance ${body.account?.balance ?? 0} · ${body.product_credits_label || "Stripe RMF product credits"}`);
    } catch (err) {
      setCreditLookup(null);
      setCreditMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCreditBusy(false);
    }
  }

  async function mutateCredits(action: "grant" | "revoke") {
    const userId = creditUserId.trim();
    const amount = Number.parseInt(creditAmount, 10);
    if (!userId) {
      setCreditMessage("Enter a user_id (OAuth subject).");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setCreditMessage("Amount must be a positive integer.");
      return;
    }
    setCreditBusy(true);
    setCreditMessage("");
    try {
      const response = await fetch("/api/operator/credits", {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          user_id: userId,
          amount,
          note: creditNote.trim() || undefined,
          action
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
      setCreditLookup(body.account as CreditAccount);
      setCreditMessage(
        action === "grant"
          ? `Granted ${amount} via grantCredits. Balance ${body.account?.balance ?? body.balance ?? 0} (Stripe RMF product ledger — not Vercel).`
          : `Revoked ${amount} via revokeCredits (audited operator_revoke). Balance ${body.account?.balance ?? body.balance ?? 0}.`
      );
      await onMutated();
    } catch (err) {
      setCreditMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCreditBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Founder grant / revoke — product credits (Stripe ledger)</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Look up an OAuth <code>user_id</code>, then grant or revoke into the same audited{" "}
        <code>rmf_credit_ledger</code> used by checkout webhooks and Action metering. Not Vercel Hobby / AI Gateway.
        Pack size {packSize}. Optional first-OAuth signup grant is {signupCredits} when enabled (
        <code>RMF_SIGNUP_CREDITS</code>; set <code>0</code> to disable). No automatic mutation without an audit row.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          style={{ ...input, minWidth: 280 }}
          placeholder="OAuth user_id"
          value={creditUserId}
          onChange={(e) => setCreditUserId(e.target.value)}
        />
        <input
          style={{ ...input, minWidth: 120, flex: "0 0 120px" }}
          placeholder="Amount"
          value={creditAmount}
          onChange={(e) => setCreditAmount(e.target.value)}
        />
        <input
          style={input}
          placeholder="Note (optional)"
          value={creditNote}
          onChange={(e) => setCreditNote(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={secondaryButton} disabled={creditBusy || !canMutate} onClick={() => void lookupCredits()}>
          {creditBusy ? "Working…" : "Show balance / ledger"}
        </button>
        <button style={button} disabled={creditBusy || !canMutate} onClick={() => void mutateCredits("grant")}>
          Grant credits
        </button>
        <button style={dangerButton} disabled={creditBusy || !canMutate} onClick={() => void mutateCredits("revoke")}>
          Revoke credits
        </button>
      </div>
      {creditMessage && <p style={{ marginBottom: 0, marginTop: 12 }}>{creditMessage}</p>}
      {creditLookup && (
        <div style={{ marginTop: 14 }}>
          <div style={funnelRow}>
            <span>User</span>
            <strong>
              <code>{creditLookup.user_id}</code>
            </strong>
          </div>
          <div style={funnelRow}>
            <span>Current Stripe RMF balance</span>
            <strong>{num(creditLookup.balance)}</strong>
          </div>
          <div style={funnelRow}>
            <span>Lifetime purchased</span>
            <strong>{num(creditLookup.lifetime_purchased)}</strong>
          </div>
          <div style={funnelRow}>
            <span>Lifetime spent</span>
            <strong>{num(creditLookup.lifetime_spent)}</strong>
          </div>
          {!!creditLookup.recent_ledger?.length && (
            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="opsTable">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reason</th>
                    <th>Action</th>
                    <th>Delta</th>
                    <th>Balance</th>
                    <th>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {creditLookup.recent_ledger.map((row) => (
                    <tr key={row.id}>
                      <td>{when(row.created_at)}</td>
                      <td>{row.reason}</td>
                      <td>{text(row.action)}</td>
                      <td>{row.delta}</td>
                      <td>{row.balance_after}</td>
                      <td>
                        <code>{text(row.external_ref)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
