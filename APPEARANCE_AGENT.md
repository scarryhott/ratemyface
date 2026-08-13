# Autonomous Appearance Agent (PAID)

90-day “improve my professional image” plan/check-in Actions for Rate My Face. **Paid, not LIVE unlimited coaching.** Plans and check-ins recap Account Learning + Compare history; they fail honestly if required history is missing.

## Status (now)

| Surface | Value |
|---------|--------|
| Feature flag | `appearance_agent.enabled=true` |
| Health status | `paid` |
| Dashboard | `PAID` · live plan/check-in counts |
| OpenAPI Actions | `appearancePlan` (`POST /api/appearance`), `appearanceCheckin` (`POST /api/appearance/plans`) |
| Cost | 1 credit (`PERSONAL_ACTION_COST` / `consumeCredits` of 1) — same unit as Personal Network and Compare |
| Unauthenticated | `401 oauth_required` (not a free product) |

## Requires

1. OAuth
2. `consent_appearance=true`
3. Account Learning history (profile / interaction / recommendation)
4. Compare Me To Me history (a compare job on the account)
5. Credits (1) on the existing Stripe ledger

Missing required history returns `400` — no invented coaching or medical claims. Social OAuth is user-authorized only (no scraping). Amazon / `searchProduct` is untouched.

## Schema

Tables:

- `rmf_appearance_plans` — `user_id`, `goal`, `status` (`draft` / `active` / `paused` / `completed`), `day_index` (0–90), baseline soft refs, `metadata`
- `rmf_appearance_checkins` — `plan_id`, `user_id`, `day_index`, soft links to `recommendation_id` / `interaction_id` / `compare_job_id` when present

Soft links (no FK) keep Account Learning / Compare schemas independent.

RLS (aligned with personal/billing + compare):

- Server writes via postgres role (`POSTGRES_URL` / `DATABASE_URL`)
- `anon` denied
- `authenticated` own-row `SELECT` only
- Do **not** `FORCE ROW LEVEL SECURITY`

Migration: `supabase/migrations/20260812200000_create_rmf_appearance_agent_tables.sql`

## API

| Endpoint | Behavior |
|----------|----------|
| `GET /api/appearance` | OAuth metadata (401 without auth) |
| `POST /api/appearance` | Paid `appearancePlan` — create or return the active 90-day plan |
| `GET /api/appearance/plans` | OAuth list of the caller’s plans/check-ins (not an OpenAPI Action) |
| `POST /api/appearance/plans` | Paid `appearanceCheckin` — honest check-in against an existing plan |

Health: `GET /api/health` → `appearance_agent.enabled=true`, `status=paid`, `public_unauthenticated=401 oauth_required`.

## Operator dashboard

Section **5c. Appearance Agent** shows **PAID**, live plan/check-in counts, and a clear **not LIVE unlimited coaching** callout. No fake metrics.

Agent Console / `agentBusinessLoop` must not invent LIVE coaching.

## Monitor notes

- Re-import `/api/openapi` (2.5.6). Do **not** paste `GPT_INSTRUCTIONS.md`.
- Do not enable social scraping; social OAuth is user-authorized only.
- Do not change Amazon / `searchProduct` / affiliate.
- Paid plan/check-in ops meter Stripe RMF product credits at 1 (`PERSONAL_ACTION_COST`).
- Harness stage: **admitted** as a paid Action (`operator/HARNESS.md`).
