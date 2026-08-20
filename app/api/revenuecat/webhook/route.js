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
    if (
      event.type === "NON_RENEWING_PURCHASE" &&
      event.product_id === "climb_credit_100"
    ) {
      const userId = event.app_user_id;

      if (!userId) {
        throw new Error("RevenueCat credit purchase is missing app_user_id");
      }

      await grantTopupCredits({
        userId,
        amount: 100,
        reason: "revenuecat_topup_purchase",
        revenueCatEventId: event.id,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("RevenueCat webhook processing failed:", error);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
