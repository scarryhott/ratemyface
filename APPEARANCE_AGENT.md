# Autonomous Appearance Agent (scaffold — not LIVE)

90-day “improve my professional image” plan/check-in scaffolding for Rate My Face. **Not LIVE paid coaching.** Schema + RLS + disabled stubs only so Cursor/monitor can iterate.

## Status (now)

| Surface | Value |
|---------|--------|
| Feature flag | `appearance_agent.enabled=false` |
| Health status | `requires_compare_and_learning` |
| Dashboard | `DISABLED` · counts `0` / Unavailable |
| OpenAPI Action | **none** until flag + Account Learning + Compare path ready |
| Paid coaching | **not claimed / not shipped** |

## Depends on (gates)

1. **Account Learning** history (Personal Network profiles / interactions / recommendations)
2. **Compare Me To Me** path (still DISABLED — see compare gate)
3. **Optional social** provider connections (`not_configured`)
4. Future **credits metering** for paid ops (Stripe RMF product credits — not Vercel infra)

Amazon product path is untouched. Social stays `not_configured`. Compare stays DISABLED.

## Schema

Tables:

- `rmf_appearance_plans` — `user_id`, `goal`, `status` (`draft` / `active` / `paused` / `completed`), `day_index` (0–90), baseline soft refs, `metadata`
- `rmf_appearance_checkins` — `plan_id`, `user_id`, `day_index`, soft links to `recommendation_id` / `interaction_id` / `compare_job_id` when present

Soft links (no FK) keep Account Learning / Compare schemas independent.

RLS (aligned with PR #21 personal/billing + compare):

- Server writes via postgres role (`POSTGRES_URL` / `DATABASE_URL`)
- `anon` denied
- `authenticated` own-row `SELECT` only
- Do **not** `FORCE ROW LEVEL SECURITY`

Migration: `supabase/migrations/20260812200000_create_rmf_appearance_agent_tables.sql`

## API stubs

| Endpoint | Behavior |
|----------|----------|
| `GET\|POST /api/appearance` | `503` + `error: appearance_agent_disabled` |
| `GET\|POST /api/appearance/plans` | `503` + `error: appearance_agent_disabled` (draft-only server writes not exposed) |

Health: `GET /api/health` → `appearance_agent.enabled=false`, `status=requires_compare_and_learning`, tables listed.

## Operator dashboard

Section **5c. Appearance Agent** (under Show metrics) shows **DISABLED**, plan/check-in counts as live empties (`0`) or **Unavailable**, and a clear **not LIVE paid coaching** callout. No fake metrics.

Agent Console / `agentBusinessLoop` snapshot keeps `appearance_agent_enabled: false` and improve-cycle goals must not invent LIVE coaching.

## Monitor notes

- Do not enable Appearance Agent until Account Learning history + Compare Me To Me are ready.
- Do not add an OpenAPI Action for plans/check-ins while the flag is off.
- Future paid plan/check-in ops should meter Stripe RMF product credits.
- Leave Compare DISABLED; leave social `not_configured`; do not touch Amazon Creators.
- Harness stage: **implemented-disabled** (`operator/HARNESS.md`).
