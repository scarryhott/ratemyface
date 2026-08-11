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
