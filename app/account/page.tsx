"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

type Entitlements = {
  ok: true;
  credits: number;
  credit_checkout_available: boolean;
  metered_costs: Record<string, number>;
};

type CreditOffer = {
  ok: true;
  credits: number;
  unit_amount: number;
  currency: string;
};

let browserClient: SupabaseClient | null = null;

const PAID_FEATURES = [
  ["01", "Personal history", "Save the preferences and outcomes that should shape future recommendations."],
  ["02", "Compare Me To Me", "Use real before-and-after references to compare your own progress over time."],
  ["03", "Appearance plan", "Turn your stored evidence into a focused 90-day professional-image plan."],
  ["04", "Personal experiments", "Track two options and keep insufficient or tied evidence honest."]
] as const;

function customerClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Customer sign-in is not configured.");
  browserClient = createClient(url, key, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true }
  });
  return browserClient;
}

function displayPrice(offer: CreditOffer | null) {
  if (!offer) return "Live price at checkout";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: offer.currency.toUpperCase()
  }).format(offer.unit_amount / 100);
}

export default function CustomerAccountPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [offer, setOffer] = useState<CreditOffer | null>(null);
  const [status, setStatus] = useState("Checking your account...");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadAccount(activeSession: Session) {
    const response = await fetch("/api/billing/entitlements", {
      headers: { Authorization: `Bearer ${activeSession.access_token}` },
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body.error || "account_unavailable"));
    setEntitlements(body as Entitlements);
  }

  useEffect(() => {
    let live = true;
    let supabase: SupabaseClient;
    try {
      supabase = customerClient();
    } catch (cause) {
      setStatus("Customer sign-in is unavailable.");
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    void Promise.all([
      supabase.auth.getSession(),
      fetch("/api/billing/credits/offer").then(async (response) => {
        const body = await response.json().catch(() => ({}));
        return response.ok ? body as CreditOffer : null;
      })
    ]).then(async ([sessionResult, creditOffer]) => {
      if (!live) return;
      setOffer(creditOffer);
      const activeSession = sessionResult.data.session;
      setSession(activeSession);
      if (!activeSession) {
        setStatus("Sign in with a secure email link to see your credits.");
        return;
      }
      await loadAccount(activeSession);
      if (live) setStatus("Account connected.");
    }).catch((cause) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!live) return;
      setSession(nextSession);
      if (!nextSession) {
        setEntitlements(null);
        setStatus("Sign in with a secure email link to see your credits.");
        return;
      }
      void loadAccount(nextSession)
        .then(() => setStatus("Account connected."))
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendMagicLink() {
    setBusy(true);
    setError("");
    try {
      const normalized = email.trim();
      if (!normalized) throw new Error("Enter your email address.");
      const supabase = customerClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo: `${window.location.origin}/account` }
      });
      if (signInError) throw signInError;
      setStatus("Check your email for the secure Rate My Face sign-in link.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function buyCredits() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/credits/checkout?source=web_account", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.checkout_url) throw new Error(String(body.error || "checkout_unavailable"));
      window.location.assign(String(body.checkout_url));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await customerClient().auth.signOut();
    setEntitlements(null);
    setBusy(false);
  }

  const balance = entitlements?.credits ?? 0;
  const packSize = offer?.credits ?? 100;

  return (
    <main className="accountPortal">
      <nav className="accountNav">
        <a href="/" className="accountWordmark">RMF / ACCOUNT</a>
        <span>One balance. Every paid feature.</span>
      </nav>

      <section className="accountHero">
        <div>
          <p className="accountKicker">Rate My Face customer account</p>
          <h1>Your look gets better when your history travels with you.</h1>
          <p className="accountLead">
            Credits unlock persistent preferences, before-and-after comparison, personal experiments, and your 90-day appearance plan.
          </p>
        </div>
        <div className="accountBalance" aria-live="polite">
          <span>Available credits</span>
          <strong>{session ? balance : "--"}</strong>
          <small>{session ? status : "Sign in to reveal your balance"}</small>
        </div>
      </section>

      {!session ? (
        <section className="accountSignIn">
          <div>
            <p className="accountKicker">Start here</p>
            <h2>Connect your account</h2>
            <p>No password to remember. We send a secure sign-in link to your email.</p>
          </div>
          <div className="accountSignInForm">
            <label htmlFor="account-email">Email address</label>
            <input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
            <button type="button" onClick={sendMagicLink} disabled={busy}>{busy ? "Sending..." : "Send secure sign-in link"}</button>
            <small>{status}</small>
          </div>
        </section>
      ) : (
        <section className="accountPurchase">
          <div>
            <p className="accountKicker">Credit pack</p>
            <h2>{packSize} credits</h2>
            <p>Credits are granted only after Stripe confirms payment through the signed webhook.</p>
          </div>
          <div className="accountPurchaseAction">
            <strong>{displayPrice(offer)}</strong>
            <button type="button" onClick={buyCredits} disabled={busy || !entitlements?.credit_checkout_available}>
              {busy ? "Opening Stripe..." : `Buy ${packSize} credits`}
            </button>
            <button className="accountTextButton" type="button" onClick={signOut} disabled={busy}>Sign out</button>
          </div>
        </section>
      )}

      <section className="accountFeatureGrid" aria-label="Paid Rate My Face features">
        {PAID_FEATURES.map(([number, title, description]) => (
          <article key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <small>From 1 credit</small>
          </article>
        ))}
      </section>

      {error && <div className="accountError" role="alert">{error}</div>}
      <footer className="accountFooter">
        <span>Payments are handled by Stripe. Rate My Face never collects card details.</span>
        <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}
