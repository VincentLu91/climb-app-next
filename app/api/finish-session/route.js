import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  const { sessionId } = await request.json();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: coachingSession } = await supabase
    .from("coaching_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!coachingSession) {
    return Response.json(
      { error: "Coaching session not found" },
      { status: 404 },
    );
  }

  const { data: chatHistory, error: chatHistoryError } = await supabase
    .from("chat_history")
    .select("message, sender, created_at")
    .eq("user_id", user.id)
    .eq("coaching_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (chatHistoryError) {
    console.error("Failed to load session history:", chatHistoryError);

    return Response.json(
      { error: "Failed to load coaching session" },
      { status: 500 },
    );
  }

  const sessionTranscript = chatHistory
    .map((item) => `${item.sender}: ${item.message}`)
    .join("\n");

  const cohereResponse = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "command-a-plus-05-2026",
      messages: [
        {
          role: "system",
          content: `You are summarizing a completed climbing coaching session.

Use only evidence from the session transcript.

Return exactly two lines:

SESSION_SUMMARY: <concise summary of what happened, including meaningful changes, recurring limitations, and what appeared to work>
NEXT_SESSION_FOCUS: <one concise priority the climber should carry into the next session>

Do not invent observations that are not present in the transcript.
Use plain text only.`,
        },
        {
          role: "user",
          content: sessionTranscript,
        },
      ],
    }),
  });

  if (!cohereResponse.ok) {
    const errorText = await cohereResponse.text();
    console.error("Cohere session summary error:", errorText);

    return Response.json(
      { error: "Failed to summarize coaching session" },
      { status: 500 },
    );
  }

  const cohereData = await cohereResponse.json();

  const summaryText =
    cohereData.message?.content?.find((item) => item.type === "text")?.text ??
    "";

  const sessionSummary =
    summaryText.match(/SESSION_SUMMARY:\s*(.*)/)?.[1]?.trim() ?? "";

  const nextSessionFocus =
    summaryText.match(/NEXT_SESSION_FOCUS:\s*(.*)/)?.[1]?.trim() ?? "";

  const { error: saveSessionError } = await supabase
    .from("coaching_sessions")
    .update({
      session_summary: sessionSummary,
      next_session_focus: nextSessionFocus,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (saveSessionError) {
    console.error("Failed to save session learning:", saveSessionError);

    return Response.json(
      { error: "Failed to save session learning" },
      { status: 500 },
    );
  }

  return Response.json({
    sessionId,
    sessionSummary,
    nextSessionFocus,
  });
}
