# Rate My Face — Experiment Log

Append one concise entry per material experiment.

## Entry template

### YYYY-MM-DD — Experiment name
- **Surface:** GPT / Vercel API / website / affiliate flow / new GPT / distribution
- **Hypothesis:**
- **Variant A:**
- **Variant B:**
- **Metric:**
- **Evidence/source:**
- **Result:** pending / win / loss / inconclusive
- **Change made:**
- **Rollback:**
- **Next:**

---

### 2026-08-09 — Baseline architecture
- **Surface:** GPT + Vercel + Amazon affiliate flow
- **Hypothesis:** A model-native-first GPT with optional Actions is more robust than making product resolution fail when an Action is unavailable.
- **Variant A:** Action-mandatory product resolution.
- **Variant B:** Native web/product research with Actions as additive verification/features.
- **Metric:** product-link success, recommendation relevance, failure rate, affiliate-link correctness.
- **Evidence/source:** current manual testing and repo state.
- **Result:** pending.
- **Change made:** canonical context moved toward native-first + additive Actions; daily-growth context established.
- **Rollback:** restore prior GPT instruction version from Git history.
- **Next:** establish measurable baseline using real GPT and Associates stats when available, then test one change at a time.

### 2026-08-10 — Persistent personal network retention
- **Surface:** GPT + Vercel API
- **Hypothesis:** Users offered an authenticated cross-session personal profile/history and recommendation feedback loop will return more often than users receiving isolated session-only recommendations.
- **Variant A:** Native/session-only appearance and product recommendation.
- **Variant B:** Same free experience plus optional paid persistent Personal Network that recalls profile, interaction history, saved recommendations and feedback.
- **Metric:** 7-day return rate among exposed authenticated users; secondary: paid Action adoption and saved-recommendation feedback rate.
- **Evidence/source:** deployed repo surface plus public adjacent-product research showing history/personal-style profiles and social/share loops as recurring differentiation patterns; direct Rate My Face usage/retention telemetry is not connected yet.
- **Result:** pending.
- **Change made:** deployed `getPersonalNetwork` and `updatePersonalNetwork`; reads/writes are credit-metered server-side. No new Action added in this daily run beyond documenting the already-deployed surface.
- **Rollback:** revert personal-network commits or remove the two operations from OpenAPI while retaining underlying tables.
- **Next:** re-import OpenAPI v2.4.0 into the Custom GPT, run a manual authenticated transcript, then add first-party Action telemetry before evaluating the hypothesis.

### 2026-08-10 — Persistent value framing vs one-shot rating
- **Surface:** GPT
- **Hypothesis:** Framing Rate My Face as an opt-in style/recommendation system that improves from saved feedback will produce more authenticated return behavior than emphasizing one-shot face scoring/rating.
- **Variant A:** one-shot appearance analysis + product recommendation framing.
- **Variant B:** same free response plus a concise optional Personal Network prompt focused on saved preferences, recommendation feedback, and future continuity.
- **Metric:** Personal Network opt-in rate and 7-day authenticated return rate; guardrail: free recommendation completion rate must not decrease by more than 5%.
- **Evidence/source:** current OpenAPI has persistent profile/history/feedback; public adjacent style apps increasingly emphasize history, closets/profiles, and personalization, while 2026 consumer research reports generic AI styling and trust as adoption weaknesses.
- **Result:** pending — no first-party Action/return telemetry is connected yet.
- **Change made:** aligned canonical GPT and Stripe billing documentation to the deployed OpenAPI v2.4.0 credit-metered Action surface; no new Action or endpoint was added.
- **Rollback:** revert commits `5b5de88962b556719d11ac9f3fe82256589f0244` and `54c562eb1f961de9cf0cdd0fdad434c19a3d49c1`.
- **Next:** re-import the deployed OpenAPI schema, run one manual authenticated GPT transcript, then instrument Action calls/402s/returning authenticated users before interpreting the A/B test.

### 2026-08-12 — Continuity CTA after free recommendation
- **Surface:** GPT + Personal Network activation
- **Hypothesis:** After a successful free product recommendation, a concise optional prompt to save relevant preferences for next time will increase authenticated Personal Network activation without reducing completion of the free recommendation flow.
- **Variant A:** neutral follow-up with no persistence prompt.
- **Variant B:** concise opt-in continuity prompt offering account-backed preference saving; paid persistence is attempted only after explicit user intent/consent.
- **Metric:** `updatePersonalNetwork` attempts/successes per successful `searchProduct`; secondary: credit-checkout starts and 7-day authenticated return rate; guardrail: free recommendation completion does not fall more than 5%.
- **Evidence/source:** live Rate My Face state shows zero Stripe Checkout Sessions and zero credit-account rows, so activation is the immediate funnel gap; current public adjacent apps emphasize learned taste/profiles, routine/history, and progress over one-shot analysis.
- **Result:** pending — first-party GPT/Action funnel telemetry is still missing.
- **Change made:** fixed an internal table-name collision that would have broken paid saved-recommendation writes by separating Personal Network recommendations into `rmf_personal_recommendations` (commit `ba7310254421f38d47924a161740469ca1ebe246`). No Action operation, endpoint, parameter contract, auth requirement, or OpenAPI schema changed.
- **Rollback:** revert commit `ba7310254421f38d47924a161740469ca1ebe246`.
- **Next:** verify the fix deploys, run one authenticated `getEntitlements → updatePersonalNetwork → getPersonalNetwork` transcript, then instrument activation events before judging the CTA experiment.

### 2026-08-12 — Social provider OAuth framework (skeleton)
- **Surface:** Vercel API + Supabase schema + operator dashboard
- **Hypothesis:** An OAuth-ready `rmf_provider_connections` path (Instagram / LinkedIn / TikTok) can sit behind clear `not_configured` stubs without enabling scraping or live provider launch.
- **Variant A:** n/a (infra skeleton only)
- **Variant B:** n/a
- **Metric:** stubs return `501 not_configured`; health `social_providers.enabled=false`; dashboard connection counts are live `0` or Unavailable — no fake metrics.
- **Evidence/source:** migration `20260812190000_rmf_provider_connections_oauth.sql`, `/api/providers*`, `SOCIAL_PROVIDERS.md`, operator section 5b.
- **Result:** pending ops apply of migration; no live OAuth until secrets configured.
- **Change made:** token_ref/connected_at/revoked_at columns + RLS re-assert; connect/disconnect stubs; dashboard Social section; Compare Me To Me remains DISABLED; Amazon untouched.
- **Rollback:** revert social-provider OAuth skeleton commits; leave prior `rmf_provider_connections` base table from personal/billing RLS migration.
- **Next / monitor:** do not enable live social OAuth until Instagram/LinkedIn/TikTok credentials exist in Vercel; never log raw tokens — store encrypted `token_ref` only.

### 2026-08-12 — Autonomous Appearance Agent (scaffold, not LIVE)
- **Surface:** Vercel API + Supabase schema + operator dashboard + Agent Console business loop notes
- **Hypothesis:** A 90-day appearance plan/check-in schema can sit behind `appearance_agent.enabled=false` / `requires_compare_and_learning` without falsely claiming LIVE paid coaching.
- **Variant A:** n/a (infra scaffold only)
- **Variant B:** n/a
- **Metric:** stubs return `503 appearance_agent_disabled`; health `appearance_agent.enabled=false`; dashboard plans/check-ins are live `0` or Unavailable — no fake metrics; GPT instructions say not live.
- **Evidence/source:** migration `20260812200000_create_rmf_appearance_agent_tables.sql`, `/api/appearance*`, `APPEARANCE_AGENT.md`, operator section 5c, `agentBusinessLoop` gate note.
- **Result:** pending ops apply of migration; feature stays DISABLED until Account Learning history + Compare Me To Me ready.
- **Change made:** plans/checkins tables + RLS; gate module; 503 stubs; health + dashboard Appearance Agent section with not-LIVE callout; credits metering noted for future paid ops. Amazon untouched; social stays `not_configured`; Compare stays DISABLED.
- **Rollback:** revert appearance-agent scaffold commits; drop `rmf_appearance_*` tables if applied.
- **Next / monitor:** do not add OpenAPI Action or flip LIVE until learning + compare gates met; meter future paid ops via Stripe RMF credits.
