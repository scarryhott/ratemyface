export default function Home() {
  return (
    <main>
      <h1>Rate My Face</h1>
      <p>
        This site supports the Rate My Face GPT with verified Amazon product recommendations.
      </p>
      <p><strong>As an Amazon Associate I earn from qualifying purchases.</strong></p>
      <div className="card">
        <h2>API status</h2>
        <p>
          Health: <a href="/api/health">/api/health</a>
        </p>
        <p>
          Action schema: <a href="/api/openapi">/api/openapi</a>
        </p>
        <p>
          Privacy: <a href="/privacy">/privacy</a>
        </p>
      </div>
    </main>
  );
}
