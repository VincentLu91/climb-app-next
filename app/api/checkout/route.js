import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

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

    const priceId = process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!priceId) {
      throw new Error("Missing STRIPE_MONTHLY_PRICE_ID");
    }

    const stripe = getStripe();
    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: user.email,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          user_id: user.id,
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
