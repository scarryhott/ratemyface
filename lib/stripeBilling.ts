import Stripe from "stripe";
import { db, ensureMemorySchema } from "./db";

let stripeClient: Stripe | null = null;
let billingSchemaReady: Promise<void> | null = null;

export const PREMIUM_FEATURE = "premium";

export function stripeSecretConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripePriceConfigured(): boolean {
  return Boolean(process.env.STRIPE_PRICE_ID_PREMIUM);
}

export function stripeConfigured(): boolean {
  return stripeSecretConfigured() && stripePriceConfigured();
}

export function stripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function premiumPriceId(): string {
  const price = process.env.STRIPE_PRICE_ID_PREMIUM;
  if (!price) throw new Error("STRIPE_PRICE_ID_PREMIUM is not configured.");
  return price;
}

export async function ensureBillingSchema(): Promise<void> {
  if (billingSchemaReady) return billingSchemaReady;
  billingSchemaReady = (async () => {
    await ensureMemorySchema();
    const sql = db();
    await sql`
      create table if not exists rmf_billing_accounts (
        user_id text primary key,
        stripe_customer_id text unique,
        stripe_subscription_id text unique,
        subscription_status text,
        price_id text,
        current_period_end timestamptz,
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists rmf_entitlements (
        user_id text not null,
        feature text not null,
        active boolean not null default false,
        source text not null default 'stripe',
        expires_at timestamptz,
        updated_at timestamptz not null default now(),
        primary key (user_id, feature)
      )
    `;
    await sql`
      create table if not exists rmf_stripe_events (
        event_id text primary key,
        event_type text not null,
        processed_at timestamptz not null default now()
      )
    `;
    await sql`create index if not exists rmf_billing_customer_idx on rmf_billing_accounts(stripe_customer_id)`;
    await sql`create index if not exists rmf_billing_subscription_idx on rmf_billing_accounts(stripe_subscription_id)`;
  })();
  return billingSchemaReady;
}

export async function billingAccount(userId: string) {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select user_id, stripe_customer_id, stripe_subscription_id, subscription_status, price_id, current_period_end, updated_at
    from rmf_billing_accounts
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] || null;
}

export async function saveStripeCustomer(userId: string, customerId: string) {
  await ensureBillingSchema();
  const sql = db();
  await sql`
    insert into rmf_billing_accounts (user_id, stripe_customer_id, updated_at)
    values (${userId}, ${customerId}, now())
    on conflict (user_id) do update
      set stripe_customer_id = excluded.stripe_customer_id,
          updated_at = now()
  `;
}

export async function userIdForStripeCustomer(customerId: string): Promise<string | null> {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select user_id from rmf_billing_accounts
    where stripe_customer_id = ${customerId}
    limit 1
  `;
  return rows.length ? String(rows[0].user_id) : null;
}

export async function userIdForStripeSubscription(subscriptionId: string): Promise<string | null> {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select user_id from rmf_billing_accounts
    where stripe_subscription_id = ${subscriptionId}
    limit 1
  `;
  return rows.length ? String(rows[0].user_id) : null;
}

function entitledStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export async function setSubscriptionState(input: {
  userId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string | null;
  priceId?: string | null;
  currentPeriodEnd?: Date | null;
}) {
  await ensureBillingSchema();
  const sql = db();
  const { userId, customerId, subscriptionId, status, priceId, currentPeriodEnd } = input;

  await sql`
    insert into rmf_billing_accounts (
      user_id, stripe_customer_id, stripe_subscription_id, subscription_status, price_id, current_period_end, updated_at
    ) values (
      ${userId}, ${customerId || null}, ${subscriptionId || null}, ${status || null}, ${priceId || null}, ${currentPeriodEnd || null}, now()
    )
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, rmf_billing_accounts.stripe_customer_id),
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, rmf_billing_accounts.stripe_subscription_id),
      subscription_status = excluded.subscription_status,
      price_id = coalesce(excluded.price_id, rmf_billing_accounts.price_id),
      current_period_end = excluded.current_period_end,
      updated_at = now()
  `;

  const active = entitledStatus(status);
  await sql`
    insert into rmf_entitlements (user_id, feature, active, source, expires_at, updated_at)
    values (${userId}, ${PREMIUM_FEATURE}, ${active}, 'stripe', ${currentPeriodEnd || null}, now())
    on conflict (user_id, feature) do update set
      active = excluded.active,
      source = excluded.source,
      expires_at = excluded.expires_at,
      updated_at = now()
  `;
}

export async function getEntitlements(userId: string) {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select feature, active, source, expires_at, updated_at
    from rmf_entitlements
    where user_id = ${userId}
    order by feature
  `;
  const activeFeatures = rows
    .filter((row) => row.active === true && (!row.expires_at || new Date(row.expires_at) > new Date()))
    .map((row) => String(row.feature));
  const account = await billingAccount(userId);
  return {
    premium: activeFeatures.includes(PREMIUM_FEATURE),
    features: activeFeatures,
    subscription_status: account?.subscription_status || null,
    current_period_end: account?.current_period_end || null
  };
}

export async function hasEntitlement(userId: string, feature = PREMIUM_FEATURE): Promise<boolean> {
  const entitlements = await getEntitlements(userId);
  return entitlements.features.includes(feature);
}

export async function markStripeEventProcessed(eventId: string, eventType: string): Promise<boolean> {
  await ensureBillingSchema();
  const sql = db();
  const inserted = await sql`
    insert into rmf_stripe_events (event_id, event_type)
    values (${eventId}, ${eventType})
    on conflict (event_id) do nothing
    returning event_id
  `;
  return inserted.length > 0;
}
