import dashboard from "../../data/dashboard.json";

type VitalStat = {
  label: string;
  value: string | number;
  note: string;
};

type FeatureStatus = {
  name: string;
  status: "LIVE" | "PAID" | "READY" | "NOT CONFIGURED" | "PLANNED";
  tone: "live" | "paid" | "ready" | "blocked" | "planned";
  summary: string;
  stats: string[];
};

function FeatureCard({ feature }: { feature: FeatureStatus }) {
  return (
    <article className="featureStatusCard">
      <div className="featureStatusHeader">
        <h3>{feature.name}</h3>
        <span className={`featureBadge featureBadge--${feature.tone}`}>{feature.status}</span>
      </div>
      <p>{feature.summary}</p>
      <div className="featureStats" aria-label={`${feature.name} vital stats`}>
        {feature.stats.map((stat) => (
          <span key={stat}>{stat}</span>
        ))}
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const vitalStats = dashboard.vital_stats as VitalStat[];
  const features = dashboard.features as FeatureStatus[];
  const current = features.filter((feature) => feature.status !== "PLANNED");
  const available = current.filter((feature) => feature.status !== "NOT CONFIGURED");
  const planned = features.filter((feature) => feature.status === "PLANNED");

  return (
    <main className="featureDashboard">
      <a className="featureDashboardBack" href="/">
        ← Rate My Face
      </a>

      <header className="featureDashboardHero">
        <div>
          <p className="featureDashboardEyebrow">Product dashboard</p>
          <h1>Features and status</h1>
          <p className="featureDashboardIntro">
            What exists, what is ready, and the evidence needed to distinguish activity from a conclusion.
          </p>
        </div>
        <div className="featureClosureBadge">
          <strong>{available.length}</strong>
          <span>available or ready</span>
        </div>
      </header>

      <section aria-labelledby="vital-stats-title">
        <div className="featureSectionHeading">
          <div>
            <p className="featureDashboardEyebrow">Current evidence</p>
            <h2 id="vital-stats-title">Vital stats</h2>
          </div>
          <p>Database snapshot · {dashboard.updated_at}</p>
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

      <section aria-labelledby="available-features-title">
        <div className="featureSectionHeading">
          <div>
            <p className="featureDashboardEyebrow">Current product</p>
            <h2 id="available-features-title">Current feature status</h2>
          </div>
          <p>LIVE and PAID are available. READY is implemented in an open pull request.</p>
        </div>
        <div className="featureStatusGrid">
          {current.map((feature) => (
            <FeatureCard feature={feature} key={feature.name} />
          ))}
        </div>
      </section>

      <section aria-labelledby="planned-features-title">
        <div className="featureSectionHeading">
          <div>
            <p className="featureDashboardEyebrow">Next closure</p>
            <h2 id="planned-features-title">Planned</h2>
          </div>
          <p>Not claimed as implemented.</p>
        </div>
        <div className="featureStatusGrid featureStatusGrid--planned">
          {planned.map((feature) => (
            <FeatureCard feature={feature} key={feature.name} />
          ))}
        </div>
      </section>
    </main>
  );
}
