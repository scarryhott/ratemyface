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
