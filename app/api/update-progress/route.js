import { createRequestClient, getRequestUser } from "@/lib/supabase/request";
import { spendCredits } from "@/lib/subscription/entitlement";

export async function POST(request) {
  const { analysisText } = await request.json();

  if (!analysisText) {
    return Response.json({ error: "Missing analysisText" }, { status: 400 });
  }

  const { supabase, accessToken } = await createRequestClient(request);

  const {
    data: { user },
  } = await getRequestUser(supabase, accessToken);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentState, error: currentStateError } = await supabase
    .from("climber_progress_state")
    .select(
      "active_limiter, progress_note, current_experiment, next_attempt_test",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentStateError) {
    console.error("Failed to load climber progress:", currentStateError);

    return Response.json(
      { error: "Failed to load climber progress" },
      { status: 500 },
    );
  }

  const currentStateText = currentState
    ? [
        `Active limiter: ${currentState.active_limiter || "None"}`,
        `Progress note: ${currentState.progress_note || "None"}`,
        `Current experiment: ${currentState.current_experiment || "None"}`,
        `Next attempt test: ${currentState.next_attempt_test || "None"}`,
      ].join("\n")
    : "No existing progress state.";

  const creditsSpent = await spendCredits({
    userId: user.id,
    amount: 1,
    reason: "progress_update",
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
          content: `You maintain a climber's current coaching progression state.

Update the state using the newest visual climbing analysis.

The newest analysis is the strongest evidence. Do not keep an old limiter active if the new analysis indicates it has improved or a different limiter is now more important.

Return exactly four lines:

ACTIVE_LIMITER: <single most important current limiter>
PROGRESS_NOTE: <concise description of what improved, changed, or remained>
CURRENT_EXPERIMENT: <specific coaching cue the climber should currently test>
NEXT_ATTEMPT_TEST: <what the next climbing attempt should verify>

Use only evidence provided below.
Use plain text only.`,
        },
        {
          role: "user",
          content: `CURRENT PROGRESSION STATE:
${currentStateText}

NEWEST VISUAL ANALYSIS:
${analysisText}`,
        },
      ],
    }),
  });

  if (!cohereResponse.ok) {
    const errorText = await cohereResponse.text();
    console.error("Cohere progress update error:", errorText);

    return Response.json(
      { error: "Failed to update climber progress" },
      { status: 500 },
    );
  }

  const cohereData = await cohereResponse.json();

  const progressText =
    cohereData.message?.content?.find((item) => item.type === "text")?.text ??
    "";

  const updatedState = {
    activeLimiter:
      progressText.match(/ACTIVE_LIMITER:\s*(.*)/)?.[1]?.trim() ?? "",
    progressNote:
      progressText.match(/PROGRESS_NOTE:\s*(.*)/)?.[1]?.trim() ?? "",
    currentExperiment:
      progressText.match(/CURRENT_EXPERIMENT:\s*(.*)/)?.[1]?.trim() ?? "",
    nextAttemptTest:
      progressText.match(/NEXT_ATTEMPT_TEST:\s*(.*)/)?.[1]?.trim() ?? "",
  };

  const hasMissingField = Object.values(updatedState).some((value) => !value);

  if (hasMissingField) {
    console.error("Incomplete progress state:", {
      progressText,
      updatedState,
    });

    return Response.json(
      { error: "Incomplete progress state" },
      { status: 500 },
    );
  }

  const { error: saveProgressError } = await supabase
    .from("climber_progress_state")
    .upsert(
      {
        user_id: user.id,
        active_limiter: updatedState.activeLimiter,
        progress_note: updatedState.progressNote,
        current_experiment: updatedState.currentExperiment,
        next_attempt_test: updatedState.nextAttemptTest,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      },
    );

  if (saveProgressError) {
    console.error("Failed to save climber progress:", saveProgressError);

    return Response.json(
      { error: "Failed to save climber progress" },
      { status: 500 },
    );
  }

  return Response.json({
    updatedState,
  });
}
