import { createRequestClient, getRequestUser } from "@/lib/supabase/request";
import { spendCredits } from "@/lib/subscription/entitlement";

export async function POST(request) {
  const { sessionId, message } = await request.json();

  const { supabase, accessToken } = await createRequestClient(request);

  const {
    data: { user },
  } = await getRequestUser(supabase, accessToken);

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

  const { data: progressState, error: progressStateError } = await supabase
    .from("climber_progress_state")
    .select(
      "active_limiter, progress_note, current_experiment, next_attempt_test",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (progressStateError) {
    console.error("Failed to load climber progress:", progressStateError);

    return Response.json(
      { error: "Failed to load climber progress" },
      { status: 500 },
    );
  }

  const progressContext = progressState
    ? [
        `Active limiter: ${progressState.active_limiter || "None"}`,
        `Progress note: ${progressState.progress_note || "None"}`,
        `Current experiment: ${progressState.current_experiment || "None"}`,
        `Next attempt test: ${progressState.next_attempt_test || "None"}`,
      ].join("\n")
    : "No current progression state is available.";

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
    .select("message, sender, coaching_helpful")
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

The CURRENT PROGRESSION STATE below is the canonical description of what the coach is currently tracking for this climber.

Treat these four fields as the source of truth for the climber's current coaching state:
- active limiter
- progress
- current experiment
- next attempt test

Current-session coaching history is supporting evidence and detail. It must not override or resurrect coaching state that conflicts with CURRENT PROGRESSION STATE.
Previous-session learning is older remembered context only. Do not revive an old limiter, experiment, or recommendation merely because it appears there or elsewhere in chat history.

Some prior Coach responses may include explicit USER FEEDBACK saying that specific response was helpful or not helpful.

Treat this feedback as a weak coaching signal, not objective climbing evidence.

If a specific prior response was marked helpful, you may continue or build on that approach when it remains consistent with the current progression state and attempt evidence.

If a specific prior response was marked not helpful, do not blindly repeat the same cue, explanation, or recommendation. Reconsider how to apply the evidence-supported coaching state. A negative rating does not by itself prove that the underlying limiter is wrong.

When adapting after negative feedback, prefer narrowing the existing experiment, changing the explanation, or asking for additional evidence. Do not invent a new technique cue merely to provide a different answer.

Your job is to explain and apply the current progression state, using the coaching history and message-specific user feedback when useful to answer the climber's question.

Do not invent new observations. Do not introduce technique details that are unsupported by the available coaching evidence.

If the current progression state says something improved or changed, do not tell the climber to keep treating the older issue as current unless newer evidence supports it.

Keep responses concise and actionable.

Use plain text only. Do not use Markdown formatting such as asterisks, headings, or bullet syntax.

CURRENT PROGRESSION STATE:

${progressContext}

CURRENT SESSION COACHING HISTORY:

${coachingContext || "No analyzed attempts yet."}

PREVIOUS SESSION LEARNING:

${previousLearningContext}`,
    },
    ...chatHistory.map((item) => {
      const feedbackNote =
        item.sender !== "User" && item.coaching_helpful === true
          ? "\n\n[USER FEEDBACK: The climber marked this specific coaching response as helpful.]"
          : item.sender !== "User" && item.coaching_helpful === false
            ? "\n\n[USER FEEDBACK: The climber marked this specific coaching response as not helpful.]"
            : "";

      return {
        role: item.sender === "User" ? "user" : "assistant",
        content: `${item.message}${feedbackNote}`,
      };
    }),
  ];

  const creditsSpent = await spendCredits({
    userId: user.id,
    amount: 1,
    reason: "chat_coaching",
  });

  if (!creditsSpent) {
    return Response.json(
      {
        error: "Not enough credits.",
        code: "INSUFFICIENT_CREDITS",
      },
      { status: 402 },
    );
  }

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
