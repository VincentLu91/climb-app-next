import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  const { sessionId, message } = await request.json();

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

  const { data: previousSession, error: previousSessionError } = await supabase
    .from("coaching_sessions")
    .select("session_summary, next_session_focus, ended_at")
    .eq("user_id", user.id)
    .neq("id", sessionId)
    .not("ended_at", "is", null)
    .not("session_summary", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousSessionError) {
    console.error(
      "Failed to load previous session learning:",
      previousSessionError,
    );
  }

  const { data: uploads, error: uploadsError } = await supabase
    .from("uploads")
    .select("id, attempt_number")
    .eq("coaching_session_id", sessionId)
    .order("attempt_number", { ascending: true });

  if (uploadsError) {
    console.error("Failed to load session attempts:", uploadsError);

    return Response.json(
      { error: "Failed to load coaching session" },
      { status: 500 },
    );
  }

  const uploadIds = uploads.map((upload) => upload.id);

  let analyses = [];

  if (uploadIds.length > 0) {
    const { data, error } = await supabase
      .from("analyses")
      .select("upload_id, result")
      .in("upload_id", uploadIds)
      .eq("status", "completed");

    if (error) {
      console.error("Failed to load session analyses:", error);

      return Response.json(
        { error: "Failed to load coaching context" },
        { status: 500 },
      );
    }

    analyses = data || [];
  }

  const { data: chatHistory, error: chatHistoryError } = await supabase
    .from("chat_history")
    .select("message, sender")
    .eq("user_id", user.id)
    .eq("coaching_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (chatHistoryError) {
    console.error("Failed to load chat history:", chatHistoryError);

    return Response.json(
      { error: "Failed to load chat history" },
      { status: 500 },
    );
  }

  const coachingContext = uploads
    .map((upload) => {
      const analysis = analyses.find((item) => item.upload_id === upload.id);

      return [
        `Attempt ${upload.attempt_number}:`,
        analysis?.result || "No completed coaching analysis.",
      ].join("\n");
    })
    .join("\n\n");

  const previousLearningContext = previousSession
    ? [
        `Previous session summary: ${previousSession.session_summary}`,
        `Previous next-session focus: ${
          previousSession.next_session_focus || "None recorded."
        }`,
      ].join("\n")
    : "No previous session learning available.";

  const cohereMessages = [
    {
      role: "system",
      content: `You are an AI climbing coach.

Use evidence from the climber's current coaching session first. You may also use the previous session learning provided below when it is relevant.

Treat previous-session learning as remembered context, not proof that the same issue is happening now. Do not claim that an old weakness is still present unless the current session provides evidence for it.

Your job is to explain and apply the existing coaching feedback, connect current observations to relevant prior patterns when supported, and avoid inventing new observations or generic climbing advice.

Do not introduce technique details that were not mentioned in the coaching history, such as grip, breathing, body position, foothold selection, hip position, or movement mechanics, unless the history explicitly mentions them.

If the available evidence is limited, say so and give advice only from what is actually known.

Keep responses concise and actionable.

Use plain text only. Do not use Markdown formatting such as asterisks, headings, or bullet syntax.

PREVIOUS SESSION LEARNING:
${previousLearningContext}

CURRENT SESSION COACHING HISTORY:
${coachingContext || "No analyzed attempts yet."}`,
    },
    ...chatHistory.map((item) => ({
      role: item.sender === "User" ? "user" : "assistant",
      content: item.message,
    })),
  ];

  const cohereResponse = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "command-a-plus-05-2026",
      messages: cohereMessages,
    }),
  });

  if (!cohereResponse.ok) {
    const errorText = await cohereResponse.text();
    console.error("Cohere error:", errorText);

    return Response.json(
      { error: "Failed to generate coaching response" },
      { status: 500 },
    );
  }

  const cohereData = await cohereResponse.json();

  const reply =
    cohereData.message?.content?.find((item) => item.type === "text")?.text ||
    "I couldn't generate a coaching response.";

  return Response.json({
    reply,
    sessionId,
    message,
    attemptCount: uploads.length,
    analysisCount: analyses.length,
    chatMessageCount: chatHistory.length,
  });
}
