# Rate My Face — Stripe Billing Context

## Current model

Rate My Face currently exposes a **credit-metered** payment path for advanced persistent Actions. Legacy subscription-entitlement support remains in backend code, but the deployed OpenAPI v2.5.6 Action surface uses one-time Stripe credit checkout for paid Personal Network, legacy memory, Compare Me To Me, and Appearance operations. Premium subscription checkout stays disabled until `STRIPE_PRICE_ID_PREMIUM` is set — do not advertise premium as available in that case.

## Action classifications
- `searchProduct` — **FREE**. Product/affiliate acquisition path.
- `getEntitlements` — **PAYMENT-INFRASTRUCTURE**. Returns authenticated entitlement state and credit balance.
- `createCreditCheckoutSession` — **PAYMENT-INFRASTRUCTURE**. Creates Stripe-hosted one-time checkout for a Rate My Face credit pack.
- `getPersonalNetwork` — **PAID**. Metered persistent profile/history/saved items/connections/report.
- `updatePersonalNetwork` — **PAID**. Metered persistent profile/history/recommendation/feedback write.
- `getUserContext` — **PAID**. Legacy metered persistent context.
- `saveUserContext` — **PAID**. Legacy metered context write plus explicit personalization consent.
- `compareMeToMe` — **PAID**. Metered before/after compare (1 credit, same unit as Personal Network). Requires OAuth, explicit `consent_compare=true`, and real image refs.
- `appearancePlan` — **PAID**. Metered 90-day professional-image plan (1 credit, same unit as Personal Network). Requires OAuth, `consent_appearance=true`, and Account Learning + Compare history.
- `appearanceCheckin` — **PAID**. Metered appearance check-in (1 credit, same unit). Requires OAuth, `consent_appearance=true`, and an existing plan.
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

Current code defaults to 100 credits per pack and meters Personal Network, Compare Me To Me, and Appearance at **1 credit** (`PERSONAL_ACTION_COST` / `consumeCredits` of 1). Reporting costs 5. Unauthenticated compare/appearance is not free (`401`). Missing before/after image refs or required appearance history return `400` rather than fake analysis or invented coaching. The internal history-placeholder path (`POST /api/compare/test`) uses the same 1-credit unit and is not an OpenAPI Action. `/api/compare/jobs` stays `503`.

**Account Learning testing (no Stripe purchase required):**
1. **Preferred:** founder grant on `/operator/dashboard` → Founder grant (calls `grantCredits` → `rmf_credit_ledger`).
2. **Optional:** first-OAuth `signup_grant` via `RMF_SIGNUP_CREDITS` (default **100**; set `0` to disable). Same `grantCredits` path; does not increment `lifetime_purchased`.

After bootstrap/grant is spent, Actions return `credits_required` / HTTP 402 until a pack is bought (`createCreditCheckoutSession` → webhook → `grantCredits`) or another operator grant is applied.

**Operator grants:** `/operator/dashboard` → Founder grant — product credits (Stripe ledger) → `/api/operator/credits` looks up `creditBalance` / ledger rows and grants with existing `grantCredits`. Not Vercel Hobby or AI Gateway.

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

The deployed OpenAPI v2.5.6 billing/persistence operations are:
- `getEntitlements` — PAYMENT-INFRASTRUCTURE (includes plan, pack size, metered costs including `compare_me_to_me`, `subscription_available`; `checkout_action` when balance cannot cover the next metered Action)
- `createCreditCheckoutSession` — PAYMENT-INFRASTRUCTURE (same-turn Action on HTTP 402 / credits_required)
- `getPersonalNetwork` — PAID (REQUIRED first Action for preference/memory questions)
- `updatePersonalNetwork` — PAID (required on explicit remember/consent)
- `getUserContext` — PAID
- `saveUserContext` — PAID
- `compareMeToMe` — PAID (OAuth + `consent_compare=true` + real before/after image refs; 1 credit, same unit as Personal Network)
- `appearancePlan` — PAID (OAuth + `consent_appearance=true` + Account Learning + Compare history; 1 credit)
- `appearanceCheckin` — PAID (OAuth + `consent_appearance=true` + existing plan; 1 credit)
- `deleteUserContext` — ACCOUNT/SECURITY

If the Custom GPT still has an older schema containing `createCheckoutSession` or `createBillingPortalSession`, re-import `https://ratemyface.vercel.app/api/openapi` before relying on the current credit flow. GPT_INSTRUCTIONS.md is not modified for Compare or Appearance — re-import OpenAPI only; do not paste instructions for this change.

## Operator dashboard

`/operator/dashboard` (via `/api/operator/ops` and `/api/operator/credits`) surfaces **Rate My Face product credits** (Stripe ledger): balances, pack size, optional signup grant size, metered costs, free vs premium entitlement counts, 30-day credit usage by Action, personal-profile / memory-context counts, Stripe wiring flags, and founder grants through existing `grantCredits`. Premium is labeled “not configured” when `stripe_subscription_price_configured=false`.

### Do not confuse with Vercel balances

| System | What it is | Managed as product credits? |
|---|---|---|
| Stripe RMF credits (`rmf_credit_*`, packs of 100, metered Action cost 1) | Customer-facing persistence meter + checkout via `createCreditCheckoutSession` | **Yes** |
| Vercel hosting plan (Hobby, Active, no payment methods) | Team hosting quotas | **No** |
| Vercel AI Gateway credit (USD balance / auto-reload) | Infrastructure model spend | **No** |

The ops payload includes an `infrastructure` boundary object so the business dashboard can show Vercel Hobby / AI Gateway as separate infra context without mixing them into the product ledger.
