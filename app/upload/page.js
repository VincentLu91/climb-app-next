import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import UploadForm from "./upload-form";
import StartSessionButton from "./start-session-button";
import CheckoutSuccessTracker from "./checkout-success-tracker";

export default async function UploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: progressState, error: progressStateError } = await supabase
    .from("climber_progress_state")
    .select(
      "active_limiter, progress_note, current_experiment, next_attempt_test",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (progressStateError) {
    console.error("Failed to load climber progress:", progressStateError);
  }

  const { data: recentSessions, error: recentSessionsError } = await supabase
    .from("coaching_sessions")
    .select(
      `
    id,
    started_at,
    session_summary,
    next_session_focus,
    uploads!inner (
      id
    )
  `,
    )
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(5);

  if (recentSessionsError) {
    console.error("Failed to load recent sessions:", recentSessionsError);
  }

  return (
    <>
      <CheckoutSuccessTracker />

      <h1>Climbing Coach</h1>

      <StartSessionButton />

      <p>Or start immediately with an attempt:</p>

      <UploadForm />

      {progressState && (
        <>
          <h2>Current Coaching Focus</h2>

          <p>
            <strong>Limiter:</strong>{" "}
            {progressState.active_limiter || "No active limiter yet."}
          </p>

          <p>
            <strong>Progress:</strong>{" "}
            {progressState.progress_note || "No progress recorded yet."}
          </p>

          <p>
            <strong>Testing:</strong>{" "}
            {progressState.current_experiment || "No active experiment yet."}
          </p>

          <p>
            <strong>Next attempt:</strong>{" "}
            {progressState.next_attempt_test || "No next test yet."}
          </p>
        </>
      )}

      <h2>Recent Problems</h2>

      {recentSessions?.length ? (
        recentSessions.map((session) => (
          <div key={session.id}>
            <Link href={`/session/${session.id}`}>
              {new Date(session.started_at).toLocaleString()}
            </Link>

            <p>
              {session.uploads?.length ?? 0}{" "}
              {(session.uploads?.length ?? 0) === 1 ? "attempt" : "attempts"}
            </p>

            {session.session_summary && <p>{session.session_summary}</p>}

            {session.next_session_focus && (
              <p>
                <strong>Next focus:</strong> {session.next_session_focus}
              </p>
            )}
          </div>
        ))
      ) : (
        <p>No climbing history yet.</p>
      )}
    </>
  );
}
