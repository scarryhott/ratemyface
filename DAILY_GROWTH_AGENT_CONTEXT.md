# Rate My Face — Daily Growth Agent Context

## Mission
Grow Rate My Face and adjacent GPT/web products through a daily closed loop of review → test → improve → measure → log → expand.

## Current product
- Public Custom GPT: Rate My Face.
- Repo: `scarryhott/ratemyface`.
- Vercel app: Rate My Face backend/site.
- Growth dashboard: `/dashboard`, backed by `data/dashboard.json`.
- Amazon Associates tag: `ratemyface0a-20`.
- Current product retrieval can use native web research and optional Custom GPT Actions.
- Amazon Creators/affiliate product API is not currently available; do not invent ASINs or claim API-backed product data when unavailable.
- Existing GPT behavior: artistic rendition/image editing first; then a concise 3-column table with research, one product, and user context.
- Actions are additive and strategic. Do not add an Action merely because something can be implemented as an API.

## Strategic Action + payment policy
Treat Custom GPT Actions as the paid application boundary when they consume Rate My Face infrastructure or provide durable/advanced functionality.

Before adding a new Action, decide whether it creates enough incremental value to justify the schema surface and operational cost. Prefer native ChatGPT capability for ordinary reasoning, web research, image generation, and conversational work when no Rate My Face state/service is required. Prefer an Action when the capability needs one or more of: persistent database state, authenticated identity, cross-session history, saved recommendations/renditions, proprietary ranking or processing, account entitlements, premium computation, external provider integration, transaction state, or other server-side functionality.

Paid Action principle:
- Database-backed and advanced/persistent Actions should normally require an authenticated Rate My Face account and an active entitlement/subscription or purchased feature.
- Keep a deliberately useful free experience in the GPT so payment gates do not make the public GPT unusable.
- `getEntitlements` and `createCheckoutSession` are infrastructure Actions and must remain callable as needed to discover access and start hosted payment; do not create a circular paywall that requires payment before the user can purchase.
- Account/authentication, consent, deletion/export, privacy, and security operations must not be improperly paywalled.
- Product/affiliate functionality may remain free when strategically useful for acquisition and affiliate conversion; decide from evidence rather than assuming every Action should be paid.
- Premium candidates include persistent memory/history, saved recommendation collections, deeper longitudinal analysis, premium artistic/report modes, advanced comparisons, higher limits, proprietary processing, and other DB/compute-intensive features.
- Enforce entitlements server-side. GPT instructions alone are never sufficient authorization.
- When an Action is denied for entitlement reasons, return a structured `payment_required`/`upgrade_required` response with the hosted checkout path rather than pretending the operation succeeded.

When the agent proposes or implements a new Action, it must classify it as FREE, PAID, ACCOUNT/SECURITY, or PAYMENT-INFRASTRUCTURE and record the rationale. If it changes the OpenAPI Action surface, explicitly notify the user that the Custom GPT schema must be re-imported/updated and name the changed operations.

## Product-platform direction
Rate My Face may become a full application behind the GPT Action layer.

Planned capabilities:
- user accounts via provider-supported OAuth/authentication;
- persistent user preferences and chat/recommendation history with explicit consent;
- secure database-backed profiles/history;
- hosted checkout/subscriptions through a payment provider, never raw card collection in chat;
- server-side entitlements for premium features;
- saved renditions and recommendations;
- premium artistic modes, deeper reports, product comparisons, and other paid features;
- analytics and A/B experiment assignment;
- social/external distribution and compliant affiliate/referral/revenue integrations.

The Custom GPT is the conversational front end; Vercel/API/database/payment systems are the application layer. Target Action architecture includes `getEntitlements` and `createCheckoutSession`, followed by entitlement-gated advanced operations. Payment success must be verified by provider webhook/server-side state before granting access.

Do not store payment-card data, third-party passwords, session cookies, MFA/recovery secrets, or raw login credentials in GitHub. Use OAuth, provider APIs, Vercel Environment Variables, GitHub Actions Secrets, or a dedicated secret manager.

## Dashboard reporting
Every daily run must update `data/dashboard.json` with only evidence-backed current state before sending the user brief. The Vercel `/dashboard` page is the operational report surface.

Update where evidence is available:
- GPT uses/traffic;
- Amazon clicks, orders, commissions, conversion;
- paid users, checkout conversion, subscription state and MRR when payment systems exist;
- Action calls by FREE/PAID classification when telemetry exists;
- integration status;
- current A/B experiment and result;
- next actions;
- concise daily report entry.

If a metric cannot be read from a connected source, leave it null/unknown and state the missing integration. Never fabricate dashboard metrics.

A dashboard update is itself a repo change; Git-connected Vercel should redeploy the dashboard after the commit.

## Daily loop
1. Read this file, `GPT_INSTRUCTIONS.md`, `data/dashboard.json`, repo changes, deployment/health status, and experiment log.
2. Review the Rate My Face experience end-to-end using available public interfaces and connected tools. Do not claim to execute the Custom GPT itself if Scheduled Tasks/GPT execution is unavailable.
3. Review available product metrics. Use real connected data only. If ChatGPT GPT usage stats or Amazon Associates/payment stats are not directly accessible, explicitly request a screenshot/export or surface the missing integration instead of guessing.
4. Identify the highest-value bottleneck in recommendation quality, product-link reliability, conversion, retention, monetization, or UX.
5. Propose one small A/B hypothesis with a measurable success criterion.
6. Make safe repo/backend edits when the evidence is strong and the change is reversible. Prefer small changes, feature flags, and logs over broad rewrites.
7. Before adding an Action, determine whether native ChatGPT can do it adequately. Add Actions strategically for authenticated, persistent, proprietary, transactional, provider-integrated, or advanced functionality. Classify every new Action FREE, PAID, ACCOUNT/SECURITY, or PAYMENT-INFRASTRUCTURE.
8. For PAID Actions, require server-side entitlement checks. If payment infrastructure is not ready, build/verify payment + entitlement infrastructure before exposing the paid operation as generally available.
9. Retest deployable surfaces and record result, failure mode, and rollback path.
10. Append a concise entry to `EXPERIMENT_LOG.md`.
11. Update `data/dashboard.json` with evidence-backed metrics, integration state, current experiment, next actions, and the daily report.
12. Research public competing/similar GPTs and adjacent products, including lookalike/appearance/product-recommendation GPTs. Benchmark user promise, apparent traction, UX, monetization, and failure modes. Treat claims like usage counts as unverified until checked.
13. Identify one expansion opportunity: new GPT, website feature, account/history system, premium feature, social distribution, affiliate/referral stream, or other revenue path.
14. Send a concise daily brief with: what changed, measured evidence, experiment result, dashboard state, next recommended action, any Action-schema re-import required, and any integration/purchase/access request that requires the user.

## Payment implementation target
Implement payments through a reputable hosted-checkout provider rather than handling card details directly. The payment layer should support:
- customer/account mapping to the authenticated Rate My Face user;
- products/prices for subscription and/or one-time premium entitlements;
- `createCheckoutSession` returning a hosted checkout URL;
- webhook verification of successful checkout/subscription lifecycle events;
- durable entitlement state in Postgres/Supabase;
- `getEntitlements` for the GPT and website;
- server-side `requireEntitlement(feature)` checks on paid endpoints;
- billing/customer portal where supported;
- cancellation/expiration reflected in entitlement state;
- dashboard metrics for paid users, conversion and MRR when evidence is available.

Do not grant premium access based only on a client redirect or user statement that payment succeeded. Closure is: authenticated user → hosted checkout → verified provider event → durable entitlement → paid Action authorization.

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
NEVER store ChatGPT/OpenAI passwords, session cookies, recovery codes, Amazon Associates passwords, MFA secrets, payment credentials, or raw third-party login credentials in repository files, issues, commits, logs, or prompts.

Use provider-supported OAuth/API credentials where available. Store application secrets in Vercel Environment Variables, GitHub Actions Secrets, or a dedicated secret manager. Do not automate browser login by committing account credentials.

The agent may ask the user to connect an official integration, supply a one-time screenshot/export, or configure a secret in a secure secret store. It must never ask the user to commit a login password to GitHub.

## Scheduled-task limitation
ChatGPT Scheduled Tasks cannot directly run a Custom GPT. The daily agent may inspect GitHub, connected apps, public web surfaces, logs, and other supported tools, but must not claim it tested the Custom GPT runtime unless an actual supported interface/tool was used. When direct GPT execution is needed, request a manual test transcript/screenshot or use a future supported API/integration.

## Continuity
Every daily run should read this file, `data/dashboard.json`, and `EXPERIMENT_LOG.md` first, preserve unresolved hypotheses, and avoid repeating completed experiments unless intentionally validating reproducibility.
