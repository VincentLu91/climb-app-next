import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TRIAL_REASONS = [
  "subscription_trial_started",
  "revenuecat_subscription_trial_started",
];

const PAID_PERIOD_REASONS = [
  "subscription_period_paid",
  "revenuecat_subscription_period_started",
];

export async function isFirstPaidPeriodAfterTrial(userId) {
  const supabase = getSupabaseAdmin();

  const { data: trialTransactions, error: trialError } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .in("reason", TRIAL_REASONS)
    .limit(1);

  if (trialError) {
    throw trialError;
  }

  if (!trialTransactions?.length) {
    return false;
  }

  const { data: paidTransactions, error: paidError } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .in("reason", PAID_PERIOD_REASONS)
    .limit(1);

  if (paidError) {
    throw paidError;
  }

  return !paidTransactions?.length;
}
