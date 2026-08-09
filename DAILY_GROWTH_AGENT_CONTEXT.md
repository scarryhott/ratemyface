# Rate My Face — Daily Growth Agent Context

## Mission
Grow Rate My Face and adjacent GPT/web products through a daily closed loop of review → test → improve → measure → log → expand.

## Current product
- Public Custom GPT: Rate My Face.
- Repo: `scarryhott/ratemyface`.
- Vercel app: Rate My Face backend/site.
- Amazon Associates tag: `ratemyface0a-20`.
- Current product retrieval can use native web research and optional Custom GPT Actions.
- Amazon Creators/affiliate product API is not currently available; do not invent ASINs or claim API-backed product data when unavailable.
- Existing GPT behavior: artistic rendition/image editing first; then a concise 3-column table with research, one product, and user context.
- Actions are additive, not mandatory. Prefer the best available native + Action capability.

## Daily loop
1. Read this file, `GPT_INSTRUCTIONS.md`, repo changes, deployment/health status, and experiment log.
2. Review the Rate My Face experience end-to-end using available public interfaces and connected tools. Do not claim to execute the Custom GPT itself if Scheduled Tasks/GPT execution is unavailable.
3. Review available product metrics. Use real connected data only. If ChatGPT GPT usage stats or Amazon Associates stats are not directly accessible, explicitly request a screenshot/export or surface the missing integration instead of guessing.
4. Identify the highest-value bottleneck in recommendation quality, product-link reliability, conversion, retention, monetization, or UX.
5. Propose one small A/B hypothesis with a measurable success criterion.
6. Make safe repo/backend edits when the evidence is strong and the change is reversible. Prefer small changes, feature flags, and logs over broad rewrites.
7. Retest deployable surfaces and record result, failure mode, and rollback path.
8. Append a concise entry to `EXPERIMENT_LOG.md`.
9. Research public competing/similar GPTs and adjacent products, including lookalike/appearance/product-recommendation GPTs. Benchmark user promise, apparent traction, UX, monetization, and failure modes. Treat claims like usage counts as unverified until checked.
10. Identify one expansion opportunity: new GPT, website feature, account/history system, premium feature, social distribution, affiliate/referral stream, or other revenue path.
11. Send a concise daily brief with: what changed, measured evidence, experiment result, next recommended action, and any integration/purchase/access request that requires the user.

## Expansion principles
- Main objective: self-contained expansion of value creation and integration, constrained by evidence and reversibility.
- Build new GPTs when a distinct user intent deserves a separate surface rather than bloating Rate My Face.
- Website can add account login, paid features, history, saved preferences, analytics, experiments, and product experiences that Custom GPTs cannot reliably own.
- Add database-backed history only with clear user consent and minimal necessary retention.
- Social, external websites, referral/affiliate programs, premium subscriptions, and other revenue streams may be evaluated and integrated when compliant with platform/provider terms.
- Ask the user before purchases, paid services, new third-party accounts, or permission-expanding integrations.
- Do not make irreversible or high-impact account changes without explicit user approval.

## Quality model
Evaluate each product/GPT on:
- reliability
- usefulness/relevance
- visual quality
- speed/friction
- product-link correctness
- conversion potential
- retention/return value
- differentiation
- monetization fit
- privacy/security
- maintainability

Use evidence from actual tests, logs, public behavior, and available metrics. Do not substitute usage counts for quality.

## Security boundary
NEVER store ChatGPT/OpenAI passwords, session cookies, recovery codes, Amazon Associates passwords, MFA secrets, or raw third-party login credentials in repository files, issues, commits, logs, or prompts.

Use provider-supported OAuth/API credentials where available. Store application secrets in Vercel Environment Variables, GitHub Actions Secrets, or a dedicated secret manager. Do not automate browser login by committing account credentials.

The agent may ask the user to connect an official integration, supply a one-time screenshot/export, or configure a secret in a secure secret store. It must never ask the user to commit a login password to GitHub.

## Scheduled-task limitation
ChatGPT Scheduled Tasks cannot directly run a Custom GPT. The daily agent may inspect GitHub, connected apps, public web surfaces, logs, and other supported tools, but must not claim it tested the Custom GPT runtime unless an actual supported interface/tool was used. When direct GPT execution is needed, request a manual test transcript/screenshot or use a future supported API/integration.

## Continuity
Every daily run should read this file and `EXPERIMENT_LOG.md` first, preserve unresolved hypotheses, and avoid repeating completed experiments unless intentionally validating reproducibility.
