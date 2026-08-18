import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function syncSubscription(subscription) {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    console.error("Stripe subscription is missing user_id metadata");
    return;
  }

  const subscriptionItem = subscription.items?.data?.[0];

  const { error } = await getSupabaseAdmin()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: subscriptionItem?.price?.id ?? null,
        status: subscription.status,
        current_period_end: subscriptionItem?.current_period_end
          ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      },
    );

  if (error) {
    throw error;
  }
}

export async function POST(request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);

    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription,
          );

          await syncSubscription(subscription);
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
