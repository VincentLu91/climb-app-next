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

  const cohereMessages = [
    {
      role: "system",
      content: `You are an AI climbing coach.

Answer using only evidence contained in the climber's current coaching session history.

Your job is to explain and apply the existing coaching feedback, not to invent new observations or generic climbing advice.

Do not introduce technique details that were not mentioned in the coaching history, such as grip, breathing, body position, foothold selection, hip position, or movement mechanics, unless the history explicitly mentions them.

If the available evidence is limited, say so and give advice only from what is actually known.

Keep responses concise and actionable.

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
