"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useCreditBalance(userId) {
  const supabase = useMemo(() => createClient(), []);

  const [subscriptionCredits, setSubscriptionCredits] = useState(0);
  const [topupCredits, setTopupCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshCreditBalance = useCallback(async () => {
    if (!userId) {
      return;
    }

    const { data, error } = await supabase
      .from("credit_balances")
      .select("subscription_credits, topup_credits")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load credit balance:", error.message);
      setLoading(false);
      return;
    }

    setSubscriptionCredits(data?.subscription_credits ?? 0);
    setTopupCredits(data?.topup_credits ?? 0);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const initialRefresh = setTimeout(() => {
      void refreshCreditBalance();
    }, 0);

    function handleRefresh() {
      void refreshCreditBalance();
    }

    window.addEventListener("credit-balance-refresh", handleRefresh);

    const channel = supabase
      .channel(`credit-balance-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "credit_balances",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshCreditBalance();
        },
      )
      .subscribe();

    return () => {
      clearTimeout(initialRefresh);
      window.removeEventListener("credit-balance-refresh", handleRefresh);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, refreshCreditBalance]);

  return {
    subscriptionCredits,
    topupCredits,
    totalCredits: subscriptionCredits + topupCredits,
    loading,
    refreshCreditBalance,
  };
}

export default function CreditBalance({ userId }) {
  const { totalCredits, loading } = useCreditBalance(userId);

  return (
    <span className="credit-balance">
      {loading
        ? "Checking credits..."
        : `${totalCredits} ${totalCredits === 1 ? "credit" : "credits"} remaining`}
    </span>
  );
}
