# Rate My Face — Stripe Billing Context

## Status
Stripe billing code is implemented in the Rate My Face Vercel backend, but production billing is not active until the required Stripe environment variables and webhook are configured.

## Action classifications
- `searchProduct` — FREE. Product/affiliate acquisition path; no premium entitlement required.
- `getEntitlements` — PAYMENT-INFRASTRUCTURE. Always available to an authenticated user so the GPT can discover access.
- `createCheckoutSession` — PAYMENT-INFRASTRUCTURE. Creates a Stripe-hosted subscription Checkout URL; never collect card data in chat.
- `createBillingPortalSession` — PAYMENT-INFRASTRUCTURE. Creates a Stripe-hosted billing-management URL for an existing customer.
- `getUserContext` — PAID. Requires the server-side `premium` entitlement.
- `saveUserContext` — PAID. Requires the server-side `premium` entitlement plus explicit personalization consent.
- `deleteUserContext` — ACCOUNT/SECURITY. Never paywalled.

## Payment closure
Authenticated Rate My Face user → `createCheckoutSession` → Stripe-hosted Checkout → verified Stripe webhook → durable Supabase/Postgres billing state → `premium` entitlement → paid Action admitted.

A success-page redirect never grants access by itself. Entitlements are granted or revoked only from verified Stripe subscription state synchronized by the webhook.

## Backend routes
- `POST /api/billing/checkout` — creates subscription Checkout Session.
- `GET /api/billing/entitlements` — returns active plan/features.
- `POST /api/billing/portal` — creates Stripe Billing Portal Session.
- `POST /api/stripe/webhook` — Stripe-only webhook; not exposed as a Custom GPT Action.
- `GET|POST /api/memory/context` — premium-gated persistent memory.
- `DELETE /api/memory/context` — free authenticated deletion.

## Database state
The backend creates and maintains:
- `rmf_billing_accounts` — Rate My Face user ↔ Stripe customer/subscription mapping.
- `rmf_entitlements` — durable feature entitlements.
- `rmf_stripe_events` — processed Stripe event receipts.

## Required Vercel environment variables
Server-side only:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PREMIUM`

Optional:
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`

Never commit actual Stripe secrets to GitHub.

## Stripe dashboard setup
1. Create a Rate My Face Premium product and recurring price in Stripe.
2. Put that recurring Price ID in Vercel as `STRIPE_PRICE_ID_PREMIUM`.
3. Put the Stripe secret API key in Vercel as `STRIPE_SECRET_KEY`.
4. Register `https://ratemyface.vercel.app/api/stripe/webhook` as a Stripe webhook/event destination.
5. Subscribe at minimum to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Put that endpoint's signing secret in Vercel as `STRIPE_WEBHOOK_SECRET`.
7. Redeploy and verify `/api/health` reports all Stripe configuration flags as true.

## GPT behavior
Before using a premium Action when access is uncertain, call `getEntitlements`.

If a premium Action returns `upgrade_required`, explain the premium feature briefly. Only when the user wants to upgrade, call `createCheckoutSession` and provide its `checkout_url` unchanged. Do not claim payment succeeded until `getEntitlements` reports `premium=true` after the verified webhook has synchronized the subscription.

For billing management/cancellation requests, call `createBillingPortalSession` and provide its short-lived Stripe-hosted URL.

## Schema update requirement
The Custom GPT Action schema changed to add:
- `getEntitlements`
- `createCheckoutSession`
- `createBillingPortalSession`

and to classify `getUserContext` / `saveUserContext` as premium-gated with HTTP 402 `upgrade_required` responses.

After the deployment succeeds, re-import `https://ratemyface.vercel.app/api/openapi` in the Custom GPT editor and publish/update the GPT.
