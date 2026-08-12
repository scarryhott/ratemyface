# Rate My Face — Stripe Billing Context

## Current model

Rate My Face currently exposes a **credit-metered** payment path for advanced persistent Actions. Legacy subscription-entitlement support remains in backend code, but the deployed OpenAPI v2.5.0 Action surface uses one-time Stripe credit checkout for paid Personal Network and legacy memory operations. Premium subscription checkout stays disabled until `STRIPE_PRICE_ID_PREMIUM` is set — do not advertise premium as available in that case.

## Action classifications
- `searchProduct` — **FREE**. Product/affiliate acquisition path.
- `getEntitlements` — **PAYMENT-INFRASTRUCTURE**. Returns authenticated entitlement state and credit balance.
- `createCreditCheckoutSession` — **PAYMENT-INFRASTRUCTURE**. Creates Stripe-hosted one-time checkout for a Rate My Face credit pack.
- `getPersonalNetwork` — **PAID**. Metered persistent profile/history/saved items/connections/report.
- `updatePersonalNetwork` — **PAID**. Metered persistent profile/history/recommendation/feedback write.
- `getUserContext` — **PAID**. Legacy metered persistent context.
- `saveUserContext` — **PAID**. Legacy metered context write plus explicit personalization consent.
- `deleteUserContext` — **ACCOUNT/SECURITY**. Never paywalled.

## Payment closure

Authenticated Rate My Face user → `createCreditCheckoutSession` → Stripe-hosted Checkout → verified Stripe webhook → durable Supabase/Postgres credit ledger → sufficient credit balance → paid Action admitted.

A success-page redirect never grants credits by itself. Credits are granted only by verified webhook processing and durable ledger state.

## Backend state

The billing layer maintains subscription-compatible tables plus the active credit ledger:
- `rmf_billing_accounts`
- `rmf_entitlements`
- `rmf_stripe_events`
- `rmf_credit_accounts`
- `rmf_credit_ledger`

Current code defaults to 100 credits per pack and meters ordinary persistent memory/personal-network operations at 1 credit; reporting may cost more as declared by the endpoint.

## Stripe configuration

Required for the active credit checkout/webhook closure:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- a valid credit Price ID available to the backend (`STRIPE_PRICE_ID_CREDITS` when overriding the code default)
- Stripe webhook/event destination configured for `https://ratemyface.vercel.app/api/stripe/webhook`

Legacy subscription support additionally uses:
- `STRIPE_PRICE_ID_PREMIUM`

The health endpoint exposes separate booleans for Stripe secret, webhook, credit price, and subscription price configuration. Do not infer production readiness from code presence alone.

## Verification rule

Production payment health is established only when all relevant server configuration is present **and** a test purchase closes:

hosted Checkout → signed webhook accepted → Stripe event receipt stored → durable credit grant → `getEntitlements` returns the resulting credit balance → paid Action can consume credits.

Never collect raw card data in chat or GitHub, never store Stripe secrets in the repository, and never grant access from an unverified redirect.

## Custom GPT schema

The deployed OpenAPI v2.5.0 billing/persistence operations are:
- `getEntitlements` — PAYMENT-INFRASTRUCTURE (includes plan, pack size, metered costs, `subscription_available`)
- `createCreditCheckoutSession` — PAYMENT-INFRASTRUCTURE
- `getPersonalNetwork` — PAID (required for preference/memory questions)
- `updatePersonalNetwork` — PAID (required on explicit remember/consent)
- `getUserContext` — PAID
- `saveUserContext` — PAID
- `deleteUserContext` — ACCOUNT/SECURITY

If the Custom GPT still has an older schema containing `createCheckoutSession` or `createBillingPortalSession`, re-import `https://ratemyface.vercel.app/api/openapi` before relying on the current credit flow. Also re-paste `GPT_INSTRUCTIONS.md` so account-learning Action selection stays forced.

## Operator dashboard

`/operator/dashboard` (via `/api/operator/ops`) surfaces credit balances, pack size, metered costs, free vs premium entitlement counts, 30-day credit usage by Action, personal-profile / memory-context counts, and Stripe wiring flags. Premium is labeled “not configured” when `stripe_subscription_price_configured=false`.
