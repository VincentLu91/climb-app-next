"use client";

import { useState } from "react";
import posthog from "posthog-js";

export default function PricingPage() {
  const [loading, setLoading] = useState(null);

  async function startCheckout(purchaseType) {
    try {
      setLoading(purchaseType);

      const source =
        new URLSearchParams(window.location.search).get("source") ??
        "pricing_page";

      posthog.capture(
        "checkout_started",
        {
          source,
          purchase_type: purchaseType,
        },
        {
          send_instantly: true,
        },
      );

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseType,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        alert(data.error || "Unable to start checkout.");
        return;
      }

      window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  return (
    <main>
      <h1>Choose your coaching plan</h1>

      <section>
        <h2>Monthly</h2>
        <p>CA$14.99/month</p>
        <p>7 days free, then 200 credits per month.</p>

        <button
          type="button"
          disabled={loading !== null}
          onClick={() => startCheckout("monthly")}
        >
          {loading === "monthly" ? "Loading..." : "Start monthly trial"}
        </button>
      </section>

      <section>
        <h2>Yearly</h2>
        <p>CA$149.99/year</p>
        <p>7 days free, then 2,400 credits per year.</p>

        <button
          type="button"
          disabled={loading !== null}
          onClick={() => startCheckout("yearly")}
        >
          {loading === "yearly" ? "Loading..." : "Start yearly trial"}
        </button>
      </section>

      <section>
        <h2>Credit pack</h2>
        <p>CA$9.99 one-time</p>
        <p>100 credits. No subscription required.</p>

        <button
          type="button"
          disabled={loading !== null}
          onClick={() => startCheckout("topup")}
        >
          {loading === "topup" ? "Loading..." : "Buy credit pack"}
        </button>
      </section>
    </main>
  );
}
