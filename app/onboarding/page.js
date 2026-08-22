import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded_at) {
    redirect("/");
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Link className="wordmark" href="/">CLIMB<span>/</span>COACH</Link>
        <span className="onboarding-header-note">PERSONALIZE YOUR COACH</span>
      </header>
      <div className="onboarding-layout">
        <section className="onboarding-intro" aria-labelledby="onboarding-title">
          <p className="eyebrow">A SHORT SETUP FOR BETTER SESSIONS</p>
          <h1 id="onboarding-title">Make the next<br /><em>move yours.</em></h1>
          <p className="onboarding-lede">Tell your coach what matters before you climb. Your answers become context, not a verdict.</p>
          <div className="onboarding-side-note"><span>↳</span><p>Six quick decisions.<br />Then go climb.</p></div>
        </section>
        <OnboardingForm userId={user.id} />
      </div>
    </main>
  );
}
