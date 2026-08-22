import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";
import AuthenticatedNavbar from "@/components/authenticated-navbar";

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
    <main className="profile-page">
      <AuthenticatedNavbar />

      <section className="profile-layout" aria-labelledby="profile-title">
        <div className="profile-intro">
          <p className="eyebrow">YOUR COACHING PROFILE</p>
          <h1 id="profile-title">
            Keep the coach
            <br />
            <em>in sync.</em>
          </h1>
          <p className="profile-lede">
            These details give every session useful context. Update them as
            your climbing changes.
          </p>
          <div className="profile-note">
            <span>↗</span>
            <p>PERSONAL CONTEXT<br />USED ACROSS YOUR SESSIONS</p>
          </div>
        </div>

        <ProfileForm userId={user.id} profile={profile} />
      </section>
    </main>
  );
}
