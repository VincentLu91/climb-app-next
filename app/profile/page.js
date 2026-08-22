import Link from "next/link";
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
    <main className="profile-page">
      <header className="profile-header">
        <Link className="wordmark" href="/" aria-label="CLIMB/COACH home">
          CLIMB<span>/</span>COACH
        </Link>
        <nav className="profile-header-note" aria-label="Account navigation"><Link href="/">Home</Link><Link href="/upload">New problem</Link><span>COACHING PROFILE / 01</span></nav>
      </header>

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
