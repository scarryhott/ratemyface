import {
  billingAccount,
  creditsPerPack,
  creditsPriceId,
  saveStripeCustomer,
  stripe,
  stripeCreditsPriceConfigured,
  stripeSecretConfigured
} from "./stripeBilling";

export type CreditCheckoutSource = "web_account" | "chatgpt_action" | "mcp_credit_action";

/** Creates an attributed Stripe-hosted checkout session. It never charges a card. */
export async function createCreditCheckout(input: {
  userId: string;
  origin: string;
  source: CreditCheckoutSource;
}) {
  if (!stripeSecretConfigured() || !stripeCreditsPriceConfigured()) {
    throw new Error("credit_checkout_not_configured");
  }

  const client = stripe();
  const existing = await billingAccount(input.userId);
  let customerId = existing?.stripe_customer_id ? String(existing.stripe_customer_id) : "";

  if (!customerId) {
    const customer = await client.customers.create({ metadata: { rmf_user_id: input.userId } });
    customerId = customer.id;
    await saveStripeCustomer(input.userId, customerId);
  }

  const credits = creditsPerPack();
  const webAccountCheckout = input.source === "web_account";
  const session = await client.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: input.userId,
    line_items: [{ price: creditsPriceId(), quantity: 1 }],
    metadata: {
      rmf_user_id: input.userId,
      purchase_type: "credits",
      credits: String(credits),
      checkout_source: input.source
    },
    success_url: webAccountCheckout
      ? `${input.origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`
      : process.env.STRIPE_SUCCESS_URL || `${input.origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: webAccountCheckout
      ? `${input.origin}/account?checkout=cancelled`
      : process.env.STRIPE_CANCEL_URL || `${input.origin}/dashboard?checkout=cancelled`
  });

  if (!session.url) throw new Error("checkout_url_unavailable");
  return { checkout_url: session.url, session_id: session.id, credits, checkout_source: input.source };
}
