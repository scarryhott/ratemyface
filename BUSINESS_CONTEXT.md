# Unified Rate My Face Business Context

This file contains durable decisions extracted from the supplied Grok Bot transcript. Runtime facts must be reverified before acting because the transcript is historical.

`UNIFIED_PROJECT_CHARTER.md` and `POLICY_INVARIANTS.json` are authoritative when any older transcript or context conflicts with this file.

## Business

- Product: Rate My Face
- Production app: `https://ratemyface.vercel.app`
- Code: `scarryhott/ratemyface`
- Core systems: GitHub, Vercel, Supabase, Railway, Stripe, and Amazon Associates
- Customer funnel: free Rate My Face GPT to account-based paid features and relevant affiliate recommendations
- Customer value: persistent personal context, comparison over time, and an appearance-improvement workflow
- Product monetization: one customer credit system across paid features; do not confuse it with Vercel, AI Gateway, model, or infrastructure credits
- Affiliate monetization: existing Amazon links are considered working unless current evidence proves otherwise
- Unified platform goal: Codex account access, full feature acceptance, an automatic GPT creator, a Vercel business dashboard, and a database-backed feature monitor and adder

## Hard Boundaries

- Harry Scott is the sole author and editor of the Rate My Face GPT instructions. AI write access is permanently forbidden with no agent exception, including exact-text replacement, restoration, synchronization, or publishing. Harry performs any instruction edit manually.
- Do not change affiliate behavior merely to optimize attribution or conversion unless Harry explicitly requests it.
- Never expose secrets in chat, logs, frontend code, commits, screenshots, or receipts.
- Do not claim that a feature is live because code merged. A feature is live only after production acceptance passes through the user-facing path.
- Do not count heartbeats, reports, signals, dashboards, PRs, or deployments as customer value by themselves.

## Product Direction

The transcript establishes this paid-feature family:

1. Personal Network / account learning
2. Compare Me To Me
3. Appearance Agent
4. Social connections when provider credentials and approvals exist

The unified system also includes a Codex agent account, automatic creation and management of other GPTs, a Vercel business-control dashboard, and a feature registry that the build agent monitors and updates.

All paid features use the same customer credit unit. The exact entitlement and debit policy must be verified from current product code before changing it.

## Agent Direction

- Cursor or another coding agent implements one bounded backlog item at a time.
- Monitoring is deterministic and delta-based. It wakes a reasoning agent only when state changed or a decision is required.
- The build loop is execution-bearing: select, implement, test, deploy, verify, record a receipt, then select again.
- Expensive model work must be tied to a concrete deliverable, incident, or revenue experiment.
- Current state is kept in a compact state record, not reconstructed from an entire conversation on every cycle.

## Required Reverification

Before choosing work, obtain a fresh snapshot of:

- production commit and health
- open PRs and CI
- paid features exposed through the actual client or GPT schema
- Stripe checkout and paid-conversion counts
- current customer-credit rules and balances
- runtime errors since the last snapshot
- protected-asset hashes

The latest verified snapshot supersedes historical claims in this file without changing the durable boundaries above.
