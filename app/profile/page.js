import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "display_name, height_cm, experience_level, typical_grade, goals, weaknesses",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile:", error);
  }

  return (
    <main>
      <h1>Your coaching profile</h1>
      <p>Update these anytime as your climbing changes.</p>

      <ProfileForm userId={user.id} profile={profile} />
    </main>
  );
}
