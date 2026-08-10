# Rate My Face OpenClaw Operator

This directory defines the integration boundary for a persistent OpenClaw operator around the existing Rate My Face stack.

Upstream: https://github.com/openclaw/openclaw

## Why separate runtime
OpenClaw is an always-on Gateway/agent runtime and expects a daemon-capable host. Rate My Face remains the Vercel serverless web/API surface. Do not embed the long-running OpenClaw Gateway inside a normal Vercel Function.

Deploy OpenClaw on an always-on Linux host/container/VM, then let it operate Rate My Face through bounded tools and provider APIs.

## Context
The operator should read, in order:
1. `DAILY_GROWTH_AGENT_CONTEXT.md`
2. `GPT_INSTRUCTIONS.md`
3. `STRIPE_BILLING_CONTEXT.md`
4. `EXPERIMENT_LOG.md`
5. `data/dashboard.json`
6. this directory's `AGENTS.md`, `SOUL.md`, and `TOOLS.md`

## Initial authority
Start read-heavy and reversible:
- GitHub repository read; branch/PR writes only.
- Vercel deployment/status/log reads; preview deployment before production.
- Stripe aggregate/business reads; no price/refund/payment mutations without approval.
- Supabase aggregate/operational access; no unrestricted user export.
- public-web competitor research.
- email/signal inbox and heartbeat.

Credentials are capabilities, not context. Keep secrets in the host/provider secret store, never workspace Markdown, GitHub commits, prompts, or logs.

## Runtime closure
`signal/heartbeat -> gather context -> propose -> policy gate -> act -> verify -> ledger -> notify -> next heartbeat`

## Deployment target
OpenClaw currently documents Node 24.15+ as recommended and supports daemon installation through `openclaw onboard --install-daemon`. Use the stable release channel first. Pin a tested version before granting production authority.

## Vercel relationship
The existing `ratemyface.vercel.app` app stays the user/API plane. OpenClaw is the operator/control plane. It can call the Rate My Face API, inspect deployments and create tested GitHub changes, but should not become a serverless request handler itself.
