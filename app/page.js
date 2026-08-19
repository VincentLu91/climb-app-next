import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let creditBalance = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.onboarded_at) {
      redirect("/onboarding");
    }

    const { data } = await supabase
      .from("credit_balances")
      .select("subscription_credits, topup_credits")
      .eq("user_id", user.id)
      .maybeSingle();

    creditBalance = data;
  }

  const subscriptionCredits = creditBalance?.subscription_credits ?? 0;
  const topupCredits = creditBalance?.topup_credits ?? 0;
  const totalCredits = subscriptionCredits + topupCredits;

  return (
    <main>
      <h1>Climbing App</h1>
      <p>{user ? `Logged in as ${user.email}` : "Not logged in"}</p>

      {user ? (
        <>
          <section>
            <h2>Credits</h2>
            <p>{totalCredits} total credits</p>
            <p>{subscriptionCredits} subscription credits</p>
            <p>{topupCredits} top-up credits</p>
          </section>

          <LogoutButton />
        </>
      ) : (
        <Link href="/login">Log in</Link>
      )}
    </main>
  );
}
