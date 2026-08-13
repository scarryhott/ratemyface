# Social provider OAuth

User-authorized OAuth only. **Never scrape.** Instagram and LinkedIn stay `not_configured` until their credentials exist. TikTok connect is live when `TIKTOK_OAUTH_CLIENT_KEY` and `TIKTOK_OAUTH_CLIENT_SECRET` are set.

## Planned providers

| Provider   | Auth mode              | Status |
|------------|------------------------|--------|
| Instagram  | User-authorized OAuth  | `not_configured` until `INSTAGRAM_OAUTH_CLIENT_ID` + `INSTAGRAM_OAUTH_CLIENT_SECRET` |
| LinkedIn   | User-authorized OAuth  | `not_configured` until `LINKEDIN_OAUTH_CLIENT_ID` + `LINKEDIN_OAUTH_CLIENT_SECRET` |
| TikTok     | User-authorized OAuth  | Live when `TIKTOK_OAUTH_CLIENT_KEY` + `TIKTOK_OAUTH_CLIENT_SECRET` are set |

## Schema

Table: `rmf_provider_connections`

- `user_id`, `provider`, `status`, `scopes`
- `external_subject`, `profile_signals`
- `token_ref` — AES-GCM ciphertext only (never raw secrets in logs)
- `token_expires_at`, `connected_at`, `revoked_at`, `updated_at`

RLS (aligned with personal/billing):

- Server writes via postgres role (`POSTGRES_URL` / `DATABASE_URL`)
- `anon` denied
- `authenticated` own-row `SELECT` only
- Do **not** `FORCE ROW LEVEL SECURITY`

Migration: `supabase/migrations/20260812190000_rmf_provider_connections_oauth.sql`

## API

| Endpoint | Behavior |
|----------|----------|
| `GET /api/providers` | OAuth required. Lists catalog + stored rows (no raw tokens). |
| `POST /api/providers/connect` | TikTok: authorize URL (or redirect). Instagram/LinkedIn: `501 not_configured`. Not a metered coaching Action. |
| `GET\|POST /api/providers/tiktok/callback` | Exchanges code, stores encrypted `token_ref` only, redirects to `/providers/connected`. |
| `POST /api/providers/disconnect` | Soft-revokes the row and clears `token_ref`. |

Health: `GET /api/health` → `social_providers.enabled=true` only if at least one provider is configured; `configured_providers` lists which; `scraping=false`.

TikTok redirect URI (intended, must match the TikTok app): `https://ratemyface.vercel.app/api/providers/tiktok/callback`

## Operator dashboard

Section **5b. Social Provider Connections** shows live connection counts (`0` when empty) or **Unavailable** when the table/DB is missing. No fake metrics.

## Monitor notes

- Instagram / LinkedIn client secrets are not available yet (captcha/2FA). Do not pretend they are configured; connect stays `501`.
- TikTok keys are Vercel Sensitive env (`TIKTOK_OAUTH_CLIENT_KEY`, `TIKTOK_OAUTH_CLIENT_SECRET`).
- Compare Me To Me is a paid Action (not a free anonymous product).
- Appearance Agent is a paid Action (not LIVE unlimited coaching; see `APPEARANCE_AGENT.md`).
- Amazon product path is untouched.
- Never log access/refresh tokens — persist encrypted `token_ref` only.
