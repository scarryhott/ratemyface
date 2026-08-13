# Social provider OAuth (skeleton)

OAuth-ready connection framework for Rate My Face. **No provider launch.** Never scrape. User-authorized OAuth only when credentials are wired later.

## Planned providers

| Provider   | Auth mode              | Status (now)     |
|------------|------------------------|------------------|
| Instagram  | User-authorized OAuth  | `not_configured` |
| LinkedIn   | User-authorized OAuth  | `not_configured` |
| TikTok     | User-authorized OAuth  | `not_configured` |

## Schema

Table: `rmf_provider_connections`

- `user_id`, `provider`, `status`, `scopes`
- `external_subject`, `profile_signals`
- `token_ref` — encrypted/vault reference only (never raw secrets in logs)
- `token_expires_at`, `connected_at`, `revoked_at`, `updated_at`

RLS (aligned with personal/billing):

- Server writes via postgres role (`POSTGRES_URL` / `DATABASE_URL`)
- `anon` denied
- `authenticated` own-row `SELECT` only
- Do **not** `FORCE ROW LEVEL SECURITY`

Migration: `supabase/migrations/20260812190000_rmf_provider_connections_oauth.sql`

## API stubs

| Endpoint | Behavior |
|----------|----------|
| `GET /api/providers` | OAuth required. Lists planned catalog + stored rows (no raw tokens). |
| `POST /api/providers/connect` | `501` + `error: not_configured` until credentials exist. |
| `POST /api/providers/disconnect` | `501 not_configured` unless a stored row exists (then soft-revoke). |

Health: `GET /api/health` → `social_providers.enabled=false`, `status=not_configured`, `scraping=false`.

## Operator dashboard

Section **5b. Social Provider Connections** shows live connection counts (`0` when empty) or **Unavailable** when the table/DB is missing. No fake metrics.

## Monitor notes

- No live social OAuth until provider secrets are configured in Vercel env.
- Leave Instagram / LinkedIn / TikTok client secrets empty; connect stubs stay `501`.
- Compare Me To Me is a paid Action (not a free anonymous product).
- Appearance Agent is a paid Action (not LIVE unlimited coaching; see `APPEARANCE_AGENT.md`).
- Amazon product path is untouched.
- Never log access/refresh tokens — persist `token_ref` only when OAuth is later implemented.
