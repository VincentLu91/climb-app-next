import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function grantTopupCredits({
  userId,
  amount,
  reason,
  revenueCatEventId,
}) {
  const { error } = await getSupabaseAdmin().rpc("grant_credits_once", {
    p_user_id: userId,
    p_bucket: "topup",
    p_amount: amount,
    p_reason: reason,

    // Existing RPC parameter name comes from the Stripe implementation.
    // Prefixing keeps RevenueCat event IDs distinct and idempotent.
    p_stripe_event_id: `revenuecat:${revenueCatEventId}`,
  });

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
  revenueCatEventId,
}) {
  const { error } = await getSupabaseAdmin().rpc(
    "refresh_subscription_credits_once",
    {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason,
      p_stripe_event_id: `revenuecat:${revenueCatEventId}`,
    },
  );

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
  const webhookAuthorization = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;

  if (!webhookAuthorization) {
    return NextResponse.json(
      { error: "Missing REVENUECAT_WEBHOOK_AUTHORIZATION" },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== webhookAuthorization) {
    return NextResponse.json(
      { error: "Invalid webhook authorization" },
      { status: 401 },
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = body?.event;

  if (!event?.id || !event?.type) {
    return NextResponse.json(
      { error: "Invalid RevenueCat event" },
      { status: 400 },
    );
  }

  try {
    const userId = event.app_user_id;

    if (!userId) {
      throw new Error("RevenueCat event is missing app_user_id");
    }

    if (
      event.type === "NON_RENEWING_PURCHASE" &&
      event.product_id === "climb_credit_100"
    ) {
      await grantTopupCredits({
        userId,
        amount: 100,
        reason: "revenuecat_topup_purchase",
        revenueCatEventId: event.id,
      });
    }

    if (
      ["INITIAL_PURCHASE", "RENEWAL"].includes(event.type) &&
      ["climb_monthly", "climb_yearly"].includes(event.product_id)
    ) {
      const isTrial =
        event.type === "INITIAL_PURCHASE" && event.period_type === "TRIAL";

      const amount = isTrial
        ? parseCreditAmount(
            process.env.TRIAL_CREDIT_AMOUNT,
            "TRIAL_CREDIT_AMOUNT",
          )
        : parseCreditAmount(
            event.product_id === "climb_yearly"
              ? process.env.YEARLY_PLAN_CREDIT_AMOUNT
              : process.env.MONTHLY_PLAN_CREDIT_AMOUNT,
            "subscription credits",
          );

      await refreshSubscriptionCredits({
        userId,
        amount,
        reason: isTrial
          ? "revenuecat_subscription_trial_started"
          : "revenuecat_subscription_period_started",
        revenueCatEventId: event.id,
      });
    }

    if (
      event.type === "EXPIRATION" &&
      ["climb_monthly", "climb_yearly"].includes(event.product_id)
    ) {
      await clearSubscriptionCredits(userId);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("RevenueCat webhook processing failed:", error);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
