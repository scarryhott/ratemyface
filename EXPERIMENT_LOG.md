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

### 2026-08-12 — Interactions → personal recommendations (Compare stays DISABLED)
- **Surface:** Vercel API + Personal Network + operator dashboard Learning section
- **Hypothesis:** Persisting Account Learning writes into `rmf_interactions` and deriving `rmf_personal_recommendations` (linked by `source_interaction_id` when a product URL/title is present) will produce non-zero Learning counts without enabling Compare/Social/Appearance.
- **Variant A:** n/a (production pipeline on existing paid Actions)
- **Variant B:** n/a
- **Metric:** after an authenticated `updatePersonalNetwork` `save_recommendation` (or `save_interaction` with `data.url`), both tables have a row; dashboard Learning interactions/recommendations are live counts; `/api/compare` stays 503; health `compare_me_to_me.enabled=false`.
- **Evidence/source:** `lib/accountLearningPipeline.ts`, migration `20260812210000_rmf_personal_recommendations_source_interaction.sql`, `/api/personal` + `/api/memory/context` writers.
- **Result:** pending deploy + one authenticated transcript.
- **Change made:** paid profile/recommendation/feedback writes record interactions; product URL/title derives/upserts personal recommendations; optional `RMF_COMPARE_TEST_LINK=1` soft-links `rmf_compare_jobs.source_interaction_id` without flipping Compare LIVE. `searchProduct` remains free and does not write learning rows. No new OpenAPI Action.
- **Rollback:** revert this pipeline commit; column `source_interaction_id` is nullable and unused if writers roll back.
- **Next / monitor:** trigger save path → row in `rmf_interactions` → row in `rmf_personal_recommendations`; confirm `/api/compare` 503 and dashboard counts (or Unavailable if tables missing).

### 2026-08-13 — Authenticated Compare Me To Me TEST path (public stays DISABLED)
- **Surface:** Vercel API + Account Learning history + operator dashboard Compare section
- **Hypothesis:** An OAuth/owner/operator-only test can persist `rmf_compare_jobs` + `rmf_compare_results` from existing profile/interaction/recommendation rows, plus a follow-up context note, without enabling public Compare or inventing products/medical claims.
- **Variant A:** n/a (internal test path)
- **Variant B:** n/a
- **Metric:** public `/api/compare` stays 503 `compare_disabled`; health `compare_me_to_me.enabled=false`; authenticated `POST /api/compare/test` (1 credit) creates job+result+follow-up; dashboard Compare counts are live (0→1) and labeled TESTING / public DISABLED.
- **Evidence/source:** `lib/compareJobs.ts` `runAuthenticatedCompareTest`, `/api/compare/test`, existing `rmf_compare_*` schema/RLS.
- **Result:** pending deploy + one authenticated/operator call against the existing Account Learning user.
- **Change made:** server-only test endpoint; honest history-placeholder result; follow-up `compare_test` interaction + `context` recommendation; credits metered via `consumeCredits`. Public OpenAPI/GPT unchanged. Amazon/social/appearance flags untouched.
- **Rollback:** revert this commit; public stubs remain 503; test rows can stay as TESTING artifacts.
- **Next / monitor:** public 503; authenticated test → job+result+follow-up; health `enabled=false`; dashboard live job counts.

### 2026-08-13 — Signup credit bootstrap vs paid-first activation
- **Surface:** GPT + OAuth + credit ledger + Personal Network
- **Hypothesis:** A 100-credit first-account bootstrap will increase successful Account Learning activation versus a paid-first 0-credit path, while preserving later checkout demand after bootstrap credits are consumed.
- **Variant A:** `RMF_SIGNUP_CREDITS=0` (new authenticated account reaches `credits_required` before first persistent write/read).
- **Variant B:** current default 100 signup credits through the same durable `rmf_credit_ledger` used by purchased credits.
- **Metric:** successful `updatePersonalNetwork`/`getPersonalNetwork` activations per new OAuth account; secondary: credits consumed before first Checkout Session, later checkout conversion after balance exhaustion, and 7-day authenticated return.
- **Evidence/source:** PR #16 is merged; live Supabase now has 1 credit account with 92 credits remaining, 8 lifetime credits spent, 0 lifetime purchased, 1 profile, 2 interactions, 2 personal recommendations, and 1 compare test/result. Stripe still has 0 Checkout Sessions, so current activation is grant/bootstrap-funded rather than purchased.
- **Result:** early activation signal only, not causal — Variant B has produced real persistent usage, but no randomized Variant A cohort or return-rate telemetry exists yet.
- **Change made:** no new Action/schema change today; logged the measurable A/B design and current evidence. Existing bootstrap remains reversible with `RMF_SIGNUP_CREDITS=0`.
- **Rollback:** set `RMF_SIGNUP_CREDITS=0`; no ledger rewrite required.
- **Next:** add cohort/event telemetry before interpreting conversion, then compare activation and 7-day return across 0-credit vs 100-credit cohorts without changing paid Action classifications.

### 2026-08-13 — Same-turn credit checkout + buy starter
- **Surface:** GPT + Stripe Checkout
- **Hypothesis:** Same-turn `createCreditCheckoutSession` on 402 / credits_required (no second yes) plus conversation starter `I want to buy Rate My Face credits` will produce the first Stripe Checkout Session.
- **Variant A:** wait for a second buy confirmation after 402 (prior GPT_INSTRUCTIONS).
- **Variant B:** MUST call checkout Action in the same 402 turn; paste Stripe URL unchanged; credits apply after webhook.
- **Metric:** Stripe Checkout Sessions > 0.
- **Evidence/source:** last 24h had 0 Checkout Sessions; 92 remaining credits on the one user are founder/signup grant, not purchases.
- **Result:** pending paste of GPT_INSTRUCTIONS.md + OpenAPI 2.5.4 re-import after merge.
- **Change made:** GPT instructions same-turn checkout; OpenAPI 2.5.4 stronger buy/balance descriptions; `getEntitlements` emits `checkout_action` + pack size when balance cannot cover next metered cost; buy-credits conversation starter. searchProduct stays FREE. Public Compare stays OFF. Stripe price IDs unchanged.
- **Rollback:** revert this commit and re-paste prior GPT_INSTRUCTIONS / OpenAPI 2.5.3.
- **Next:** monitor Stripe Checkout Sessions after instructions are pasted into the GPT editor.

### 2026-08-13 — Subscription feature = Compare Me To Me Action on credits
- **Surface:** GPT OpenAPI Action + Vercel API + Stripe credit ledger
- **Hypothesis:** Shipping Compare as an authenticated, credit-metered OpenAPI Action (real image refs, explicit consent) is the paid subscription feature; instruction rewrites are not required.
- **Variant A:** public `/api/compare` 503 stub / internal history-placeholder test only
- **Variant B:** `compareMeToMe` Action on `POST /api/compare` — OAuth + `consumeCredits` (1, same unit as Personal Network) + `consent_compare=true` + real before/after refs; 400 if refs missing; vision when https URLs work, otherwise honest limited result
- **Metric:** authenticated compare consumes credits and persists `rmf_compare_jobs` + `rmf_compare_results`; unauthenticated compare is not free; `getEntitlements.metered_costs.compare_me_to_me=1` (same as personal_network / appearance_agent)
- **Evidence/source:** OpenAPI 2.5.5 `compareMeToMe`; existing compare tables/RLS; same Stripe ledger and 1-credit unit as Personal Network
- **Result:** pending deploy + one authenticated Action call with real image refs
- **Change made:** paid Compare Action on credits; public jobs listing stays 503; Appearance/social flags unchanged; affiliate/searchProduct untouched; GPT_INSTRUCTIONS.md not modified
- **Rollback:** revert this commit and re-import prior OpenAPI 2.5.4
- **Next:** re-import `/api/openapi` (do not paste GPT instructions); run consented compare with before/after image URLs

### 2026-08-13 — Subscription feature = Appearance Agent Action on the same credit
- **Surface:** GPT OpenAPI Action + Vercel API + Stripe credit ledger
- **Hypothesis:** Shipping Appearance as authenticated, credit-metered OpenAPI Actions (honest 90-day plan/check-ins from Account Learning + Compare history) is the remaining subscription feature on the same 1-credit unit; instruction rewrites are not required.
- **Variant A:** `/api/appearance*` 503 stubs / `enabled=false` / `requires_compare_and_learning`
- **Variant B:** `appearancePlan` + `appearanceCheckin` Actions — OAuth + `consumeCredits` (1, same unit as Personal Network and Compare) + `consent_appearance=true` + required history; 400 if history/plan missing; no invented coaching or medical claims
- **Metric:** authenticated plan/check-in consumes credits and persists `rmf_appearance_plans` + `rmf_appearance_checkins`; unauthenticated appearance is not free; `getEntitlements.metered_costs.appearance_agent=1` (same as personal_network / compare_me_to_me)
- **Evidence/source:** OpenAPI 2.5.6 `appearancePlan` / `appearanceCheckin`; existing appearance tables/RLS; same Stripe ledger and 1-credit unit as Personal Network
- **Result:** pending deploy + one authenticated Action call with Account Learning + Compare history
- **Change made:** paid Appearance Actions on credits; social stays `not_configured`; affiliate/searchProduct untouched; GPT_INSTRUCTIONS.md not modified; report stays 5
- **Rollback:** revert this commit and re-import prior OpenAPI 2.5.5
- **Next:** re-import `/api/openapi` (do not paste GPT instructions); run consented appearancePlan then appearanceCheckin after Compare history exists
