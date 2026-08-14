import dashboard from "../../data/dashboard.json";

type DashboardMetrics = {
  gpt_uses: number | null;
  amazon_clicks_30d: number | null;
  amazon_commissions_30d: number | null;
  conversion_rate: number | null;
  seven_day_return_rate: number | null;
  paid_users: number;
  credit_purchases: number;
  stripe_checkout_sessions_observed: number;
  mrr: number;
  account_users?: number;
  credit_accounts?: number;
  personal_profiles: number;
  interactions: number;
  personal_recommendations: number;
  total_credit_balance: number;
  lifetime_credits_purchased: number;
  lifetime_credits_spent: number;
  stripe_events?: number;
};

type ActionClass = "FREE" | "PAID" | "PAYMENT-INFRASTRUCTURE" | "ACCOUNT/SECURITY";

type DashboardSnapshot = {
  updated_at: string;
  summary: { status: string; goal: string };
  metrics: DashboardMetrics;
  action_classification: Record<string, ActionClass>;
};

const snapshot = dashboard as unknown as DashboardSnapshot;

const actionPresentation: Record<ActionClass, { tone: string; label: string; note: string }> = {
  FREE: { tone: "live", label: "FREE", note: "No product credit debit" },
  PAID: { tone: "paid", label: "PAID", note: "Authenticated and credit-metered" },
  "PAYMENT-INFRASTRUCTURE": {
    tone: "ready",
    label: "PAYMENT",
    note: "Entitlement or hosted-checkout infrastructure"
  },
  "ACCOUNT/SECURITY": {
    tone: "blocked",
    label: "ACCOUNT",
    note: "Identity, privacy, or destructive account operation"
  }
};

function displayMetric(value: number | null, options: { money?: boolean; percent?: boolean } = {}) {
  if (value == null) return "Unavailable";
  if (options.money) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
  if (options.percent) return `${value}%`;
  return value.toLocaleString("en-US");
}

export default function DashboardPage() {
  const metrics = snapshot.metrics;
  const accountUsers = metrics.account_users ?? metrics.credit_accounts ?? metrics.personal_profiles;
  const savedHistory = metrics.interactions + metrics.personal_recommendations;
  const actions = Object.entries(snapshot.action_classification);
  const paidActions = actions.filter(([, classification]) => classification === "PAID").length;
  const purchaseClosed =
    metrics.stripe_checkout_sessions_observed > 0 &&
    metrics.lifetime_credits_purchased > 0 &&
    (metrics.stripe_events ?? 0) > 0;

  const vitalStats = [
    { label: "Account users", value: displayMetric(accountUsers), note: `${metrics.personal_profiles} persistent personal profile` },
    { label: "Saved history", value: displayMetric(savedHistory), note: `${metrics.interactions} interactions and ${metrics.personal_recommendations} recommendations` },
    { label: "Credit balance", value: displayMetric(metrics.total_credit_balance), note: `${metrics.lifetime_credits_spent} lifetime credits spent` },
    { label: "Checkout sessions", value: displayMetric(metrics.stripe_checkout_sessions_observed), note: "Stripe-hosted credit checkout observed" },
    { label: "Credits purchased", value: displayMetric(metrics.lifetime_credits_purchased), note: "Durable purchase ledger total" },
    { label: "MRR", value: displayMetric(metrics.mrr, { money: true }), note: "Recurring revenue, not product-credit balance" }
  ];

  return (
    <main className="featureDashboard">
      <a className="featureDashboardBack" href="/">
        ← Rate My Face
      </a>

      <header className="featureDashboardHero">
        <div>
          <p className="featureDashboardEyebrow">Product evidence dashboard</p>
          <h1>Value, Actions, and purchase closure</h1>
          <p className="featureDashboardIntro">{snapshot.summary.goal}</p>
        </div>
        <div className="featureClosureBadge">
          <strong>{paidActions}</strong>
          <span>metered Actions</span>
        </div>
      </header>

      <section aria-labelledby="vital-stats-title">
        <div className="featureSectionHeading">
          <div>
            <p className="featureDashboardEyebrow">Current evidence</p>
            <h2 id="vital-stats-title">Vital stats</h2>
          </div>
          <p>Database snapshot · {snapshot.updated_at}</p>
        </div>
        <div className="vitalStatsGrid">
          {vitalStats.map((stat) => (
            <article className="vitalStatCard" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="action-surface-title">
        <div className="featureSectionHeading">
          <div>
            <p className="featureDashboardEyebrow">Current product</p>
            <h2 id="action-surface-title">Action surface</h2>
          </div>
          <p>Free, paid, payment, and account operations remain explicitly distinct.</p>
        </div>
        <div className="featureStatusGrid">
          {actions.map(([operation, classification]) => {
            const presentation = actionPresentation[classification];
            return (
              <article className="featureStatusCard" key={operation}>
                <div className="featureStatusHeader">
                  <h3><code>{operation}</code></h3>
                  <span className={`featureBadge featureBadge--${presentation.tone}`}>
                    {presentation.label}
                  </span>
                </div>
                <p>{presentation.note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="purchase-closure-title">
        <div className="featureSectionHeading">
          <div>
            <p className="featureDashboardEyebrow">Monetization gate</p>
            <h2 id="purchase-closure-title">Purchase closure</h2>
          </div>
          <p>{purchaseClosed ? "Verified" : "Not proven"}</p>
        </div>
        <article className="featureStatusCard">
          <div className="featureStatusHeader">
            <h3>{purchaseClosed ? "Purchase-to-credit path verified" : "Purchase closure not proven"}</h3>
            <span className={`featureBadge featureBadge--${purchaseClosed ? "live" : "blocked"}`}>
              {purchaseClosed ? "VERIFIED" : "UNVERIFIED"}
            </span>
          </div>
          <p>
            Completion requires a Stripe Checkout Session, a signed webhook receipt, durable purchased credits, and successful paid Action use. Configuration or bootstrap-credit spending alone does not close this funnel.
          </p>
          <div className="featureStats" aria-label="Purchase closure evidence">
            <span>{metrics.stripe_checkout_sessions_observed} checkout sessions</span>
            <span>{metrics.stripe_events ?? 0} Stripe receipts</span>
            <span>{metrics.lifetime_credits_purchased} purchased credits</span>
            <span>{metrics.paid_users} paid users</span>
          </div>
        </article>
      </section>
    </main>
  );
}
