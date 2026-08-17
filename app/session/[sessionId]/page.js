import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatPanel from "./chat-panel";

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

  const { data: chatHistory, error: chatHistoryError } = await supabase
    .from("chat_history")
    .select(
      `
    message,
    sender,
    upload_id,
    uploads (
      media_path,
      media_type,
      attempt_number
    )
  `,
    )
    .eq("user_id", user.id)
    .eq("coaching_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (chatHistoryError) {
    console.error("Failed to load chat history:", chatHistoryError);
  }

  const initialMessages = await Promise.all(
    (chatHistory || []).map(async (item) => {
      let attachment = null;

      if (item.uploads?.media_path) {
        const { data: signedUrlData } = await supabase.storage
          .from("climbing-media")
          .createSignedUrl(item.uploads.media_path, 3600);

        attachment = {
          ...item.uploads,
          signedUrl: signedUrlData?.signedUrl ?? null,
        };
      }

      return {
        message: item.message,
        sender: item.sender === "User" ? "user" : "ChatGPT",
        uploadId: item.upload_id,
        attachment,
      };
    }),
  );

  return (
    <>
      <h1>Climbing Session</h1>
      <p>Session: {sessionId}</p>

      <a href="/upload">Start a different problem</a>

      <ChatPanel
        coachingSessionId={sessionId}
        userId={user.id}
        initialMessages={initialMessages}
        initialProgressState={progressState}
      />
    </>
  );
}
