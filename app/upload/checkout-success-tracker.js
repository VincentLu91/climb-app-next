"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";

export default function CheckoutSuccessTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);

    if (tracked.current || url.searchParams.get("checkout") !== "success") {
      return;
    }

    tracked.current = true;

    posthog.capture(
      "subscription_activated",
      {},
      {
        send_instantly: true,
      },
    );

    url.searchParams.delete("checkout");

    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  return null;
}
