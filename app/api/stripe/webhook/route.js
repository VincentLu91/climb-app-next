import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isFirstPaidPeriodAfterTrial } from "@/lib/subscription/credits";

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

function parseCreditAmount(value, label) {
  const amount = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Invalid ${label} credit amount`);
  }

  return amount;
}

async function refreshSubscriptionCredits({
  userId,
  amount,
  reason,
  stripeEventId,
}) {
  const { error } = await getSupabaseAdmin().rpc(
    "refresh_subscription_credits_once",
    {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_stripe_event_id: stripeEventId,
    },
  );

  if (error) {
    throw error;
  }
}

async function grantSubscriptionCredits({
  userId,
  amount,
  reason,
  stripeEventId,
}) {
  const { error } = await getSupabaseAdmin().rpc("grant_credits_once", {
    p_user_id: userId,
    p_bucket: "subscription",
    p_amount: amount,
    p_reason: reason,
    p_stripe_event_id: stripeEventId,
  });

  if (error) {
    throw error;
  }
}

async function grantTopupCredits({ userId, amount, reason, stripeEventId }) {
  const { error } = await getSupabaseAdmin().rpc("grant_credits_once", {
    p_user_id: userId,
    p_bucket: "topup",
    p_amount: amount,
    p_reason: reason,
    p_stripe_event_id: stripeEventId,
  });

  if (error) {
    throw error;
  }
}

async function clearSubscriptionCredits(userId) {
  const { error } = await getSupabaseAdmin()
    .from("credit_balances")
    .update({
      subscription_credits: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

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

        if (
          session.mode === "payment" &&
          session.payment_status === "paid" &&
          session.metadata?.purchase_type === "topup"
        ) {
          const userId = session.metadata?.user_id;

          if (!userId) {
            throw new Error("Top-up checkout is missing user_id metadata");
          }

          const amount = parseCreditAmount(
            session.metadata?.credit_amount,
            "top-up",
          );

          await grantTopupCredits({
            userId,
            amount,
            reason: "topup_purchase",
            stripeEventId: event.id,
          });
        }

        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription,
          );

          await syncSubscription(subscription);

          if (subscription.status === "trialing") {
            const userId = subscription.metadata?.user_id;

            if (!userId) {
              throw new Error("Trial subscription is missing user_id metadata");
            }

            const amount = parseCreditAmount(
              subscription.metadata?.trial_credit_amount,
              "trial",
            );

            await refreshSubscriptionCredits({
              userId,
              amount,
              reason: "subscription_trial_started",
              stripeEventId: event.id,
            });
          }
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;

        if (invoice.amount_paid <= 0) {
          break;
        }

        const subscriptionMetadata =
          invoice.parent?.subscription_details?.metadata;

        const userId = subscriptionMetadata?.user_id;

        if (!userId) {
          throw new Error(
            "Paid subscription invoice is missing user_id metadata",
          );
        }

        const amount = parseCreditAmount(
          subscriptionMetadata?.plan_credit_amount,
          "subscription",
        );

        const firstPaidAfterTrial =
          invoice.billing_reason === "subscription_cycle" &&
          (await isFirstPaidPeriodAfterTrial(userId));

        if (firstPaidAfterTrial) {
          const trialAmount = parseCreditAmount(
            subscriptionMetadata?.trial_credit_amount,
            "trial",
          );

          const remainingAmount = amount - trialAmount;

          if (remainingAmount <= 0) {
            throw new Error(
              "Paid subscription credits must exceed trial credits",
            );
          }

          await grantSubscriptionCredits({
            userId,
            amount: remainingAmount,
            reason: "subscription_period_paid",
            stripeEventId: event.id,
          });
        } else {
          await refreshSubscriptionCredits({
            userId,
            amount,
            reason: "subscription_period_paid",
            stripeEventId: event.id,
          });
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object);
        break;

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        await syncSubscription(subscription);

        const userId = subscription.metadata?.user_id;

        if (!userId) {
          throw new Error("Canceled subscription is missing user_id metadata");
        }

        await clearSubscriptionCredits(userId);

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
