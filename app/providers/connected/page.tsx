export default async function ProviderConnectedPage({
  searchParams
}: {
  searchParams: Promise<{ provider?: string; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const provider = String(params.provider || "tiktok");
  const ok = params.status === "ok";
  const error = String(params.error || "oauth_error");

  return (
    <main>
      <h1>Social provider {ok ? "connected" : "not connected"}</h1>
      <p>
        {ok
          ? `${provider} was linked with user-authorized OAuth. You can close this window.`
          : `${provider} connect did not finish (${error}). You can close this window and retry.`}
      </p>
      <p className="muted">No scraping. Encrypted token_ref only — raw tokens are never shown.</p>
    </main>
  );
}
