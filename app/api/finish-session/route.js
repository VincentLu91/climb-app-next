import { createRequestClient, getRequestUser } from "@/lib/supabase/request";
import { spendCredits } from "@/lib/subscription/entitlement";

export async function POST(request) {
  const { sessionId } = await request.json();

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

  const { data: recentSessions, error: recentSessionsError } = await supabase
    .from("coaching_sessions")
    .select("session_summary, next_session_focus, ended_at")
    .eq("user_id", user.id)
    .neq("id", sessionId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(3);

  if (recentSessionsError) {
    console.error("Failed to load recent sessions:", recentSessionsError);

    return Response.json(
      { error: "Failed to load recent climbing history" },
      { status: 500 },
    );
  }

  const progressContext = progressState
    ? [
        `Active limiter: ${progressState.active_limiter || "None"}`,
        `Progress: ${progressState.progress_note || "None"}`,
        `Current experiment: ${progressState.current_experiment || "None"}`,
        `Next attempt test: ${progressState.next_attempt_test || "None"}`,
      ].join("\n")
    : "No accumulated progression state is available.";

  const recentSessionContext = recentSessions?.length
    ? recentSessions
        .map(
          (session, index) =>
            `Recent session ${index + 1}:
Summary: ${session.session_summary || "None"}
Next focus: ${session.next_session_focus || "None"}`,
        )
        .join("\n\n")
    : "No previous completed sessions are available.";

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

  const creditsSpent = await spendCredits({
    userId: user.id,
    amount: 1,
    reason: "finish_session",
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
      messages: [
        {
          role: "system",
          content: `You are summarizing a completed climbing coaching session and choosing the climber's next-session priority.

For SESSION_SUMMARY:
Use only evidence from the CURRENT SESSION TRANSCRIPT. Summarize what happened in this session, including meaningful changes, limitations, and what appeared to work.

For NEXT_SESSION_FOCUS:
Use the CURRENT PROGRESSION STATE as the canonical description of what the coach currently believes about this climber.
Use RECENT COMPLETED SESSIONS to identify patterns that have persisted across sessions.
Use the current session as the newest evidence.

If the same limiter or coaching need persists across sessions, prioritize it.
If the newest evidence shows that an older issue improved or stopped being important, do not resurrect it.
The recommendation should be specific enough to guide the next climbing session: state what the climber should practice or test and what improvement they should look for.
Do not create a generic training program or invent drills unsupported by the coaching evidence.

Return exactly two lines:
SESSION_SUMMARY: <concise summary of this completed session>
NEXT_SESSION_FOCUS: <one specific personalized next-session recommendation>

Use plain text only.

CURRENT PROGRESSION STATE:

${progressContext}

RECENT COMPLETED SESSIONS:

${recentSessionContext}`,
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
