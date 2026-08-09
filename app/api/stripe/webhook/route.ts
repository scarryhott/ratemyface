import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { grantCredits, markStripeEventProcessed, saveStripeCustomer, setSubscriptionState, stripe, stripeWebhookConfigured, userIdForStripeCustomer, userIdForStripeSubscription } from "../../../../lib/stripeBilling";

export const runtime = "nodejs";
function objectId(value: string | { id?: string } | null | undefined): string | null { if (typeof value === "string") return value; if (value && typeof value.id === "string") return value.id; return null; }
async function syncSubscription(subscription: Stripe.Subscription, fallbackUserId?: string | null) {
  const subscriptionId = subscription.id; const customerId = objectId(subscription.customer as any);
  let userId = subscription.metadata?.rmf_user_id || fallbackUserId || null;
  if (!userId) userId = await userIdForStripeSubscription(subscriptionId);
  if (!userId && customerId) userId = await userIdForStripeCustomer(customerId);
  if (!userId) return;
  if (customerId) await saveStripeCustomer(userId, customerId);
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const periodEndSeconds = (subscription as any).current_period_end;
  await setSubscriptionState({ userId, customerId, subscriptionId, status: subscription.status, priceId, currentPeriodEnd: typeof periodEndSeconds === "number" ? new Date(periodEndSeconds * 1000) : null });
}

export async function POST(request: NextRequest) {
  if (!stripeWebhookConfigured()) return NextResponse.json({ ok: false, error: "stripe_webhook_not_configured" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false, error: "missing_stripe_signature" }, { status: 400 });
  const payload = await request.text(); let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch (error) { console.error("Stripe webhook signature verification failed", error); return NextResponse.json({ ok: false, error: "invalid_stripe_signature" }, { status: 400 }); }

  try {
    const fresh = await markStripeEventProcessed(event.id, event.type);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.rmf_user_id || null;
        const customerId = objectId(session.customer as any);
        if (userId && customerId) await saveStripeCustomer(userId, customerId);
        if (session.mode === "payment" && session.payment_status === "paid" && session.metadata?.purchase_type === "credits" && userId) {
          const credits = Number.parseInt(session.metadata.credits || "0", 10);
          if (Number.isInteger(credits) && credits > 0) await grantCredits(userId, credits, `stripe_checkout:${session.id}`, { payment_intent: objectId(session.payment_intent as any) });
        }
        const subscriptionId = objectId(session.subscription as any);
        if (subscriptionId) await syncSubscription(await stripe().subscriptions.retrieve(subscriptionId), userId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": await syncSubscription(event.data.object as Stripe.Subscription); break;
      default: break;
    }
    return NextResponse.json({ received: true });
  } catch (error) { console.error("Stripe webhook processing failed", event.type, error); return NextResponse.json({ ok: false, error: "webhook_processing_failed" }, { status: 500 }); }
}
