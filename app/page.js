import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import LogoutButton from "./logout-button";

const loopSteps = [
  ["01", "ATTEMPT", "Record the move as it happens."],
  ["02", "COACH NOTICED", "Get one sharp observation."],
  ["03", "NEXT EXPERIMENT", "Try a specific change."],
  ["04", "RETRY", "Make the next go count."],
  ["05", "ADAPT", "The coach observes the retry and changes the next recommendation based on what happened."],
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let creditBalance = null;

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", user.id).maybeSingle();
    if (!profile?.onboarded_at) redirect("/onboarding");
    const { data } = await supabase.from("credit_balances").select("subscription_credits, topup_credits").eq("user_id", user.id).maybeSingle();
    creditBalance = data;
  }

  const subscriptionCredits = creditBalance?.subscription_credits ?? 0;
  const topupCredits = creditBalance?.topup_credits ?? 0;
  const totalCredits = subscriptionCredits + topupCredits;

  if (user) {
    return (
      <main className="account-home">
        <header className="landing-header"><Link href="/" className="wordmark">CLIMB<span>/</span>COACH</Link><div className="header-actions"><span>{user.email}</span><Link href="/upload" className="header-cta">Start climbing</Link></div></header>
        <section className="account-card"><p className="eyebrow">YOUR COACHING ACCOUNT</p><h1>Keep working the <em>next attempt.</em></h1><div className="credit-row"><strong>{totalCredits}</strong><span>total credits<br /><small>{subscriptionCredits} subscription · {topupCredits} top-up</small></span></div><div className="account-actions"><Link href="/upload" className="primary-button">Start a session <span>↗</span></Link><LogoutButton /></div></section>
      </main>
    );
  }

  return (
    <main className="landing-page">
      <header className="landing-header"><Link href="/" className="wordmark">CLIMB<span>/</span>COACH</Link><nav><Link href="/login">Log in</Link><Link href="/login" className="header-cta">Start climbing <span>↗</span></Link></nav></header>
      <section className="landing-hero">
        <div className="hero-copy"><p className="eyebrow"><span className="live-dot" /> AI CLIMBING COACH</p><h1>Every attempt<br />should teach you <em>something.</em></h1><p className="hero-lede">CLIMB/COACH watches what happened, gives you one thing to try next, then adapts when you go again.</p><div className="hero-actions"><Link href="/login" className="primary-button">Start climbing <span>↗</span></Link><a href="#loop" className="text-link">See how it works <span>↓</span></a></div></div>
        <div className="hero-signal"><div className="signal-top"><span>LIVE SESSION</span><span>ADAPTIVE / 01</span></div><div className="signal-line"><i /><b /><i /><b /><i /></div><p>“Keep your hips closer<br />through the reach.”</p><div className="signal-footer"><span>COACH NOTICED</span><strong>Try it now →</strong></div></div>
      </section>
      <section id="loop" className="loop-section"><div className="section-intro"><p className="eyebrow">THE COACHING LOOP</p><h2>Not a report.<br /><em>A better next go.</em></h2></div><div className="loop-grid">{loopSteps.map(([number, title, copy], index) => <div className="loop-step" key={title}><span className="step-number">{number}</span><div><p className="step-title">{title}{index < loopSteps.length - 1 ? <span className="step-arrow">→</span> : <span className="step-arrow loop-return">↺ NEXT ATTEMPT</span>}</p><p>{copy}</p></div></div>)}</div></section>
      <section className="feature-section"><div className="feature-panel feature-panel-lime"><p className="eyebrow">WHAT YOU GET</p><h2>One focused cue<br />for the next attempt.</h2><p>Advice stays close to the wall: concise, personal, and ready to try immediately.</p><div className="mini-read"><span>COACH&apos;S READ</span><strong>Use the right foot earlier.</strong></div></div><div className="feature-panel"><p className="eyebrow">STAY IN THE SESSION</p><h2>The coach follows<br />the whole problem.</h2><p>Ask questions, share a route photo for context, and keep the conversation moving without losing the thread.</p><div className="feature-tags"><span>ATTEMPT</span><span>QUESTION</span><span>RETRY</span></div></div></section>
      <section className="memory-section"><div><p className="eyebrow">BUILT OVER TIME</p><h2>Your coaching gets<br /><em>more personal.</em></h2></div><p>Sessions do not have to start from zero. Keep the focus areas and movement patterns that matter to you in view as you return to the wall.</p></section>
      <section className="final-cta"><p className="eyebrow">READY FOR THE NEXT GO?</p><h2>Turn your next attempt<br />into a useful one.</h2><Link href="/login" className="primary-button">Start climbing <span>↗</span></Link></section>
      <footer className="landing-footer"><span className="wordmark">CLIMB<span>/</span>COACH</span><span>ADAPTIVE FEEDBACK FOR CLIMBERS</span></footer>
    </main>
  );
}
