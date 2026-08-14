# Unified Rate My Face Project Charter

## Mission

Build a unified autonomous business platform around Rate My Face. Codex acts as the unified operating agent across product development, feature access, GPT creation, infrastructure, analytics, monetization, and verified continuous improvement.

## Owner Role

Harry Scott's protected role is authorship of the Rate My Face GPT instructions. Those handwritten words are the immutable creative core of the product.

Harry may edit them manually. AI systems must never edit or publish them, including when implementing features, fixing integrations, improving conversion, synchronizing schemas, recovering versions, or restoring an earlier copy.

## System Outcomes

### Codex Account And Full Feature Access

Create a dedicated, auditable Rate My Face account identity for Codex with authorized access to exercise every product feature. Separate the agent identity from Harry's personal identity. Map it to entitlements in the unified database and use it for repeatable acceptance tests.

Full access means the agent can prove the user-facing flow for each enabled feature. It does not mean unrestricted access to unrelated personal accounts or permission to bypass approval, security, payment, or platform controls.

### Automatic GPT Creator

Build a GPT factory that can define, create, register, test, version, and monitor new business GPTs. It must:

- exclude the Rate My Face GPT from all instruction-generation and instruction-sync operations
- store each generated GPT's purpose, owner, tools, knowledge, visibility, version, status, costs, and revenue attribution in the unified database
- validate tool schemas and authentication before launch
- require an end-to-end acceptance receipt before marking a GPT active
- use browser control only where no supported API or connector exists

### Vercel Business Control Dashboard

Build one control surface with:

- product features, availability, entitlements, acceptance status, and adoption
- GPT inventory, versions, health, traffic, costs, and attributed revenue
- agent queue, leases, runs, failures, budgets, receipts, and protected-asset checks
- Stripe checkout, payments, credits, subscriptions, refunds, and conversion funnel
- affiliate clicks, orders, shipped items, commission, and attribution
- OpenAI, Vercel, Railway, Supabase, and other infrastructure usage and cost
- customer acquisition, activation, paid-feature use, retention, and unit economics
- alerts for missing data, stale integrations, failing features, and margin risk

Unavailable metrics must display as unavailable, never as zero.

### Feature Monitor And Adder

Maintain a canonical feature registry in the unified database. The feature agent must:

1. compare declared features with code, tool schemas, deployments, entitlements, and user-path evidence
2. detect missing, disabled, unhealthy, unexposed, unmonetized, or unverified features
3. rank the highest-value authorized gap
4. create one bounded implementation task with acceptance criteria and a budget
5. implement through GitHub and the appropriate platform surfaces
6. test, deploy, and verify through the Codex account
7. write feature state, evidence, cost, and business results to the unified database
8. continue only after a verified receipt

Monitoring without changed state must stop before invoking a reasoning model.

### Unified Database

Use one durable control model for:

- users, agent identities, accounts, and entitlements
- features, dependencies, versions, gates, and acceptance evidence
- GPTs, tools, knowledge sources, and immutable/protected assets
- tasks, leases, retries, approvals, deployments, and receipts
- customer credits, subscriptions, payments, affiliate events, expenses, and revenue
- product events, funnel stages, experiments, and business metrics

Every external object keeps its provider ID and latest verified timestamp. Historical chat text is evidence, not current state.

## Execution Surfaces

- Computer, Chrome, and Browser: interactive authentication and UI-only operations
- GitHub: source, branches, reviews, CI, and release evidence
- Vercel: application hosting, environment configuration, dashboard, logs, and analytics
- OpenAI Developers: MCP tools, ChatGPT app surfaces, models, and agent architecture
- Stripe: checkout, customer credits, subscriptions, revenue, and payment events
- Railway: long-running workers and browser runtime services
- Supabase: unified relational state, auth mapping, RLS, events, and receipts

Use purpose-built APIs and connectors before browser automation. Secrets are installed atomically and never exposed.

## Decision Order

1. Preserve the instruction lock and security boundaries.
2. Restore broken customer value or revenue paths.
3. Make existing paid features reachable and verifiable.
4. Improve the first measured funnel bottleneck.
5. Add the highest-value missing feature.
6. Improve automation cost, speed, and reliability.

Dashboards and monitoring support these outcomes; they do not replace them.

## Definition Of Completion

The unified platform is operational when:

- Codex has a separate auditable account that can test all authorized features
- the GPT factory can launch and register a non-protected GPT end to end
- the Vercel dashboard reports product, agent, revenue, cost, and unit-economics data with provenance
- the feature agent can detect one real gap, implement it, verify production, and update the database without manual context transfer
- all Rate My Face GPT instruction checks show no AI-authored mutation
- revenue and cost receipts support an actual profit decision

Each outcome requires current production evidence, not a historical statement or merged PR.
