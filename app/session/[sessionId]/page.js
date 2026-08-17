import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/app/upload/upload-form";

export default async function CoachingSessionPage({ params }) {
  const { sessionId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: coachingSession } = await supabase
    .from("coaching_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!coachingSession) {
    redirect("/upload");
  }

  return (
    <>
      <h1>Climbing Session</h1>
      <p>Session: {sessionId}</p>

      <UploadForm initialCoachingSessionId={sessionId} />
    </>
  );
}
