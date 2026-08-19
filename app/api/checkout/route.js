import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

function parsePositiveInteger(value, label) {
  const amount = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Invalid ${label}`);
  }

  return amount;
}

export async function POST(request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const purchaseType = body.purchaseType ?? "monthly";

    if (!["monthly", "yearly", "topup"].includes(purchaseType)) {
      return NextResponse.json(
        { error: "Invalid purchase type." },
        { status: 400 },
      );
    }

    const { data: existingSubscription, error: subscriptionError } =
      await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (subscriptionError) {
      throw subscriptionError;
    }

    const customerParams = existingSubscription?.stripe_customer_id
      ? {
          customer: existingSubscription.stripe_customer_id,
        }
      : {
          customer_email: user.email,
        };

    const stripe = getStripe();
    const origin = new URL(request.url).origin;

    if (purchaseType === "topup") {
      const priceId = process.env.STRIPE_TOPUP_PRICE_ID;

      if (!priceId) {
        throw new Error("Missing STRIPE_TOPUP_PRICE_ID");
      }

      const creditAmount = parsePositiveInteger(
        process.env.TOPUP_CREDIT_AMOUNT,
        "TOPUP_CREDIT_AMOUNT",
      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        ...customerParams,
        client_reference_id: user.id,
        metadata: {
          purchase_type: "topup",
          user_id: user.id,
          credit_amount: String(creditAmount),
        },
        success_url: `${origin}/upload?checkout=topup_success`,
        cancel_url: `${origin}/upload?checkout=canceled`,
      });

      return NextResponse.json({
        url: session.url,
      });
    }

    const isYearly = purchaseType === "yearly";

    const priceId = isYearly
      ? process.env.STRIPE_YEARLY_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!priceId) {
      throw new Error(
        isYearly
          ? "Missing STRIPE_YEARLY_PRICE_ID"
          : "Missing STRIPE_MONTHLY_PRICE_ID",
      );
    }

    const planCreditAmount = parsePositiveInteger(
      isYearly
        ? process.env.YEARLY_PLAN_CREDIT_AMOUNT
        : process.env.MONTHLY_PLAN_CREDIT_AMOUNT,
      isYearly ? "YEARLY_PLAN_CREDIT_AMOUNT" : "MONTHLY_PLAN_CREDIT_AMOUNT",
    );

    const trialCreditAmount = parsePositiveInteger(
      process.env.TRIAL_CREDIT_AMOUNT,
      "TRIAL_CREDIT_AMOUNT",
    );

    const trialDays = parsePositiveInteger(
      process.env.STRIPE_TRIAL_DAYS,
      "STRIPE_TRIAL_DAYS",
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ...customerParams,
      client_reference_id: user.id,
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          user_id: user.id,
          plan_type: purchaseType,
          trial_credit_amount: String(trialCreditAmount),
          plan_credit_amount: String(planCreditAmount),
        },
      },
      success_url: `${origin}/upload?checkout=success`,
      cancel_url: `${origin}/upload?checkout=canceled`,
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (error) {
    console.error("Checkout session creation failed:", error);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
