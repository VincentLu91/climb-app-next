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
