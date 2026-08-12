import Stripe from "stripe";
import { db, ensureMemorySchema } from "./db";

let stripeClient: Stripe | null = null;
let billingSchemaReady: Promise<void> | null = null;

export const PREMIUM_FEATURE = "premium";
export const MEMORY_CONTEXT_COST = 1;
export const DEFAULT_CREDITS_PRICE_ID = "price_1U2fcrBN7gbi1Jf6w50A1GxK";

export function stripeSecretConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripePriceConfigured(): boolean {
  return Boolean(process.env.STRIPE_PRICE_ID_PREMIUM);
}

export function stripeCreditsPriceConfigured(): boolean {
  return Boolean(process.env.STRIPE_PRICE_ID_CREDITS || DEFAULT_CREDITS_PRICE_ID);
}

export function stripeConfigured(): boolean {
  return stripeSecretConfigured() && (stripeCreditsPriceConfigured() || stripePriceConfigured());
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

export function creditsPriceId(): string {
  return process.env.STRIPE_PRICE_ID_CREDITS || DEFAULT_CREDITS_PRICE_ID;
}

export function creditsPerPack(): number {
  const parsed = Number.parseInt(process.env.RMF_CREDITS_PER_PACK || "100", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

/** One-time non-purchase bootstrap so first remember + preference read can succeed with 0 purchased credits. */
export function signupCredits(): number {
  const parsed = Number.parseInt(process.env.RMF_SIGNUP_CREDITS || "25", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
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

    await sql`
      create table if not exists rmf_credit_accounts (
        user_id text primary key,
        balance bigint not null default 0 check (balance >= 0),
        lifetime_purchased bigint not null default 0,
        lifetime_spent bigint not null default 0,
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists rmf_credit_ledger (
        id bigserial primary key,
        user_id text not null,
        delta bigint not null,
        balance_after bigint not null,
        reason text not null,
        action text,
        external_ref text unique,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;

    await sql`create index if not exists rmf_billing_customer_idx on rmf_billing_accounts(stripe_customer_id)`;
    await sql`create index if not exists rmf_billing_subscription_idx on rmf_billing_accounts(stripe_subscription_id)`;
    await sql`create index if not exists rmf_credit_ledger_user_idx on rmf_credit_ledger(user_id, created_at desc)`;
  })();
  return billingSchemaReady;
}

export async function billingAccount(userId: string) {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select user_id, stripe_customer_id, stripe_subscription_id, subscription_status,
           price_id, current_period_end, updated_at
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
    select user_id
    from rmf_billing_accounts
    where stripe_customer_id = ${customerId}
    limit 1
  `;
  return rows.length ? String(rows[0].user_id) : null;
}

export async function userIdForStripeSubscription(subscriptionId: string): Promise<string | null> {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select user_id
    from rmf_billing_accounts
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
      user_id, stripe_customer_id, stripe_subscription_id, subscription_status,
      price_id, current_period_end, updated_at
    ) values (
      ${userId}, ${customerId || null}, ${subscriptionId || null}, ${status || null},
      ${priceId || null}, ${currentPeriodEnd || null}, now()
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

export async function creditBalance(userId: string): Promise<number> {
  await ensureBillingSchema();
  const sql = db();
  const rows = await sql`
    select balance
    from rmf_credit_accounts
    where user_id = ${userId}
    limit 1
  `;
  return rows.length ? Number(rows[0].balance) : 0;
}

export type CreditGrantOptions = {
  reason?: "purchase" | "signup_grant" | "operator_grant";
  /** Purchased packs only; signup/operator grants stay off lifetime_purchased. */
  countAsPurchased?: boolean;
};

export async function grantCredits(
  userId: string,
  amount: number,
  externalRef: string,
  metadata: Record<string, unknown> = {},
  options: CreditGrantOptions = {}
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("invalid_credit_grant");
  await ensureBillingSchema();
  const sql = db();
  const reason = options.reason || "purchase";
  const countAsPurchased = options.countAsPurchased ?? reason === "purchase";
  const purchasedDelta = countAsPurchased ? amount : 0;

  const existing = await sql`
    select balance_after
    from rmf_credit_ledger
    where external_ref = ${externalRef}
    limit 1
  `;
  if (existing.length) return Number(existing[0].balance_after);

  const rows = await sql`
    insert into rmf_credit_accounts (user_id, balance, lifetime_purchased, updated_at)
    values (${userId}, ${amount}, ${purchasedDelta}, now())
    on conflict (user_id) do update set
      balance = rmf_credit_accounts.balance + ${amount},
      lifetime_purchased = rmf_credit_accounts.lifetime_purchased + ${purchasedDelta},
      updated_at = now()
    returning balance
  `;
  const balance = Number(rows[0].balance);

  await sql`
    insert into rmf_credit_ledger (
      user_id, delta, balance_after, reason, external_ref, metadata, created_at
    ) values (
      ${userId}, ${amount}, ${balance}, ${reason}, ${externalRef}, ${sql.json(metadata as any)}, now()
    )
  `;
  return balance;
}

/** Idempotent one-time signup grant for Account Learning bootstrap (not a Stripe purchase). */
export async function ensureSignupCreditGrant(userId: string): Promise<number> {
  const amount = signupCredits();
  return grantCredits(
    userId,
    amount,
    `signup_grant:${userId}`,
    { source: "account_learning_bootstrap", credits: amount },
    { reason: "signup_grant", countAsPurchased: false }
  );
}

/**
 * Owner/operator adjust of Stripe-ledger product credits (founder/test grants).
 * Positive delta grants; negative delta claws back without touching lifetime_spent usage totals.
 */
export async function adjustProductCredits(
  userId: string,
  delta: number,
  externalRef: string,
  metadata: Record<string, unknown> = {}
): Promise<{ ok: boolean; balance: number; error?: string }> {
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false, balance: await creditBalance(userId), error: "invalid_credit_adjust" };
  }
  await ensureBillingSchema();
  const sql = db();

  const existing = await sql`
    select balance_after
    from rmf_credit_ledger
    where external_ref = ${externalRef}
    limit 1
  `;
  if (existing.length) return { ok: true, balance: Number(existing[0].balance_after) };

  if (delta > 0) {
    const balance = await grantCredits(userId, delta, externalRef, metadata, {
      reason: "operator_grant",
      countAsPurchased: false
    });
    return { ok: true, balance };
  }

  const amount = -delta;
  const rows = await sql`
    insert into rmf_credit_accounts (user_id, balance, updated_at)
    values (${userId}, 0, now())
    on conflict (user_id) do update set updated_at = now()
    returning balance
  `;
  const current = Number(rows[0]?.balance || 0);
  if (current < amount) {
    return { ok: false, balance: current, error: "insufficient_balance" };
  }

  const updated = await sql`
    update rmf_credit_accounts
    set balance = balance - ${amount},
        updated_at = now()
    where user_id = ${userId}
      and balance >= ${amount}
    returning balance
  `;
  if (!updated.length) {
    return { ok: false, balance: await creditBalance(userId), error: "insufficient_balance" };
  }
  const balance = Number(updated[0].balance);
  await sql`
    insert into rmf_credit_ledger (
      user_id, delta, balance_after, reason, external_ref, metadata, created_at
    ) values (
      ${userId}, ${delta}, ${balance}, 'operator_adjust', ${externalRef}, ${sql.json(metadata as any)}, now()
    )
  `;
  return { ok: true, balance };
}

export async function creditAccountOverview(userId: string) {
  await ensureBillingSchema();
  const sql = db();
  const accounts = await sql`
    select user_id, balance, lifetime_purchased, lifetime_spent, updated_at
    from rmf_credit_accounts
    where user_id = ${userId}
    limit 1
  `;
  const ledger = await sql`
    select id, delta, balance_after, reason, action, external_ref, metadata, created_at
    from rmf_credit_ledger
    where user_id = ${userId}
    order by created_at desc
    limit 25
  `;
  const account = accounts[0] || null;
  return {
    user_id: userId,
    balance: account ? Number(account.balance) : 0,
    lifetime_purchased: account ? Number(account.lifetime_purchased) : 0,
    lifetime_spent: account ? Number(account.lifetime_spent) : 0,
    updated_at: account?.updated_at || null,
    label: "Rate My Face product credits (Stripe ledger)",
    recent_ledger: ledger.map((row: any) => ({
      id: Number(row.id),
      delta: Number(row.delta),
      balance_after: Number(row.balance_after),
      reason: String(row.reason),
      action: row.action ? String(row.action) : null,
      external_ref: row.external_ref ? String(row.external_ref) : null,
      metadata: row.metadata || {},
      created_at: row.created_at
    }))
  };
}

export async function consumeCredits(
  userId: string,
  amount: number,
  action: string,
  externalRef?: string
): Promise<{ ok: boolean; balance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("invalid_credit_cost");
  await ensureBillingSchema();
  const sql = db();

  if (externalRef) {
    const existing = await sql`
      select balance_after
      from rmf_credit_ledger
      where external_ref = ${externalRef}
      limit 1
    `;
    if (existing.length) return { ok: true, balance: Number(existing[0].balance_after) };
  }

  const rows = await sql`
    update rmf_credit_accounts
    set balance = balance - ${amount},
        lifetime_spent = lifetime_spent + ${amount},
        updated_at = now()
    where user_id = ${userId}
      and balance >= ${amount}
    returning balance
  `;

  if (!rows.length) return { ok: false, balance: await creditBalance(userId) };
  const balance = Number(rows[0].balance);

  await sql`
    insert into rmf_credit_ledger (
      user_id, delta, balance_after, reason, action, external_ref, created_at
    ) values (
      ${userId}, ${-amount}, ${balance}, 'usage', ${action}, ${externalRef || null}, now()
    )
  `;
  return { ok: true, balance };
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
  const credits = await creditBalance(userId);
  return {
    premium: activeFeatures.includes(PREMIUM_FEATURE),
    features: activeFeatures,
    credits,
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
