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
    <main>
      <h1>Onboarding {profile?.display_name}</h1>
      <OnboardingForm userId={user.id} />
    </main>
  );
}
