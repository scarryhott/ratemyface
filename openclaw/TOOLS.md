# Tool Registry Plan

Expose capabilities incrementally. Each wrapper should have a stable name, explicit inputs, output evidence and authority level.

## Initial
- `project_context_read` L0: canonical repo context/dashboard/experiment files.
- `github_read` L0: repo status, files, PRs, issues.
- `github_branch_write` L2: create branch and proposed changes; never direct secret writes.
- `vercel_observe` L0: deployments, health, runtime errors, aggregate analytics where available.
- `vercel_preview` L3: preview deploy/verify.
- `stripe_observe` L0: aggregate product/price/revenue/payment status only.
- `public_research` L0: competitors, GPT/product opportunities, platform changes.
- `signal_read` L0: authenticated owner email/signal queue.
- `owner_notify` L1: reports, approvals, integration requests.

## Later after validation
- `experiment_assign` L4: bounded feature-flag experiment.
- `production_promote` L4/L6 depending scope.
- `stripe_price_write` L6.
- `model_job_submit` L5 with explicit budget.
- social provider connectors: scoped OAuth only; provider-specific permissions.

## Ledger requirement
Every mutating tool returns a receipt suitable for an append-only operational ledger: request id, actor, authority, target, timestamp, cost, before/after identifier, verification and rollback reference.
