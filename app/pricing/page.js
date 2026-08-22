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
    <main className="pricing-page">
      <header className="pricing-header">
        <a className="wordmark" href="/">
          CLIMB<span>/</span>COACH
        </a>
        <div className="pricing-header-actions">
          <span>ADAPTIVE COACHING</span>
          <a href="/profile">Profile</a>
        </div>
      </header>

      <section className="pricing-hero">
        <div>
          <p className="eyebrow">KEEP THE LOOP MOVING</p>
          <h1>
            Coaching that <em>keeps up.</em>
          </h1>
          <p className="pricing-lede">
            Use credits for focused video analysis, route context, and ongoing
            coaching. Choose a plan for regular sessions or a pack for the
            days you want to drop in.
          </p>
        </div>
        <div className="pricing-hero-note">
          <span>YOUR NEXT SESSION</span>
          <strong>Ready when you are.</strong>
          <p>Pick up where your coaching loop left off.</p>
        </div>
      </section>

      <section className="pricing-section" aria-labelledby="plans-heading">
        <div className="pricing-section-heading">
          <div>
            <p className="eyebrow">REGULAR PRACTICE</p>
            <h2 id="plans-heading">Choose your rhythm.</h2>
          </div>
          <span>SUBSCRIPTIONS</span>
        </div>
        <div className="pricing-plans">
          <article className="pricing-card">
            <div className="pricing-card-top"><span>01 / MONTHLY</span><span>7 DAYS FREE</span></div>
            <h3>Monthly</h3>
            <p className="pricing-price">CA$14.99<span>/ month</span></p>
            <p className="pricing-description">For climbers building a consistent practice with 200 credits each month after the trial.</p>
            <button type="button" disabled={loading !== null} onClick={() => startCheckout("monthly")}>
              {loading === "monthly" ? "Loading..." : "Start monthly trial"}<span>↗</span>
            </button>
          </article>
          <article className="pricing-card pricing-card-featured">
            <div className="pricing-card-top"><span>02 / YEARLY</span><span className="pricing-accent">RECOMMENDED RHYTHM</span></div>
            <h3>Yearly</h3>
            <p className="pricing-price">CA$149.99<span>/ year</span></p>
            <p className="pricing-description">For a full season of adaptive coaching with 2,400 credits each year after the trial.</p>
            <button type="button" disabled={loading !== null} onClick={() => startCheckout("yearly")}>
              {loading === "yearly" ? "Loading..." : "Start yearly trial"}<span>↗</span>
            </button>
          </article>
        </div>
      </section>

      <section className="pricing-pack" aria-labelledby="pack-heading">
        <div>
          <p className="eyebrow">OCCASIONAL USE</p>
          <h2 id="pack-heading">Just need a few more attempts?</h2>
          <p>Buy 100 credits once. No subscription required.</p>
        </div>
        <div className="pricing-pack-action">
          <strong>CA$9.99 <span>ONE-TIME</span></strong>
          <button type="button" disabled={loading !== null} onClick={() => startCheckout("topup")}>
            {loading === "topup" ? "Loading..." : "Buy credit pack"}<span>↗</span>
          </button>
        </div>
      </section>

      <footer className="pricing-footer">
        <span>CREDITS KEEP YOUR COACHING LOOP MOVING.</span>
        <span>ANALYZE · ASK · ADAPT</span>
      </footer>
    </main>
  );
}
