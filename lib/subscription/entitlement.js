import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function hasActiveSubscription(supabase, userId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.status === "active" || data?.status === "trialing";
}

export async function hasAvailableCredits(supabase, userId) {
  const { data, error } = await supabase
    .from("credit_balances")
    .select("subscription_credits, topup_credits")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.subscription_credits ?? 0) + (data?.topup_credits ?? 0) > 0;
}

export async function spendCredits({ userId, amount, reason }) {
  const { data, error } = await getSupabaseAdmin().rpc("spend_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }

  return data === true;
}
