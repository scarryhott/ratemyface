import dashboard from "../../data/dashboard.json";

function value(v: unknown) {
  if (v === null || v === undefined) return "Not connected";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

export default function DashboardPage() {
  const metrics = dashboard.metrics as Record<string, unknown>;
  const integrations = dashboard.integrations as Record<string, unknown>;

  return (
    <main style={{ maxWidth: 1100 }}>
      <p><a href="/">← Rate My Face</a></p>
      <h1>Growth Dashboard</h1>
      <p>{dashboard.summary.goal}</p>
      <p><strong>Status:</strong> {dashboard.summary.status} · <strong>Updated:</strong> {dashboard.updated_at}</p>

      <section className="dashboardGrid">
        {Object.entries(metrics).map(([key, v]) => (
          <div className="card metricCard" key={key}>
            <div className="metricLabel">{key.replaceAll("_", " ")}</div>
            <div className="metricValue">{value(v)}</div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Integrations</h2>
        <div className="statusList">
          {Object.entries(integrations).map(([key, v]) => (
            <div key={key}><strong>{key.replaceAll("_", " ")}:</strong> {value(v)}</div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Current A/B experiment</h2>
        <p><strong>{dashboard.current_experiment.name}</strong></p>
        <p>A: {dashboard.current_experiment.variant_a}</p>
        <p>B: {dashboard.current_experiment.variant_b}</p>
        <p><strong>Success:</strong> {dashboard.current_experiment.success_metric}</p>
        <p><strong>Status:</strong> {dashboard.current_experiment.status}</p>
      </section>

      <section className="card">
        <h2>Next actions</h2>
        <ul>{dashboard.next_actions.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="card">
        <h2>Daily reports</h2>
        {dashboard.daily_reports.length === 0 ? (
          <p>No daily reports recorded yet.</p>
        ) : (
          <pre>{JSON.stringify(dashboard.daily_reports, null, 2)}</pre>
        )}
      </section>
    </main>
  );
}
