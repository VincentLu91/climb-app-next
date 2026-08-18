"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import { createClient } from "@/lib/supabase/client";

export default function PostHogIdentity() {
  useEffect(() => {
    const supabase = createClient();

    async function identifyCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        posthog.identify(user.id);
      }
    }

    identifyCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        posthog.reset();
        return;
      }

      if (session?.user) {
        posthog.identify(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
