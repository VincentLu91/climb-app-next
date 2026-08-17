import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/app/upload/upload-form";
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

  const { data: chatHistory, error: chatHistoryError } = await supabase
    .from("chat_history")
    .select("message, sender")
    .eq("user_id", user.id)
    .eq("coaching_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (chatHistoryError) {
    console.error("Failed to load chat history:", chatHistoryError);
  }

  const initialMessages = (chatHistory || []).map((item) => ({
    message: item.message,
    sender: item.sender === "User" ? "user" : "ChatGPT",
  }));

  return (
    <>
      <h1>Climbing Session</h1>
      <p>Session: {sessionId}</p>

      <UploadForm initialCoachingSessionId={sessionId} />

      <ChatPanel
        coachingSessionId={sessionId}
        userId={user.id}
        initialMessages={initialMessages}
      />
    </>
  );
}
