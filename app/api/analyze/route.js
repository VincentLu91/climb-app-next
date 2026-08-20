import { createRequestClient, getRequestUser } from "@/lib/supabase/request";
import { spendCredits } from "@/lib/subscription/entitlement";

export async function POST(request) {
  try {
    const {
      videoUrl,
      attemptNumber,
      previousAnalysisText,
      previousSessionFocus,
    } = await request.json();

    const { supabase, accessToken } = await createRequestClient(request);

    const {
      data: { user },
      error: userError,
    } = await getRequestUser(supabase, accessToken);

    if (userError || !user) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    let progressState = null;
    let climberProfile = null;

    if (user) {
      const { data, error } = await supabase
        .from("climber_progress_state")
        .select("active_limiter, current_experiment, next_attempt_test")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load climber progress state:", error);
      } else {
        progressState = data;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("height_cm, experience_level, typical_grade, goals, weaknesses")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to load climber profile:", profileError);
      } else {
        climberProfile = profileData;
      }
    }

    if (!videoUrl) {
      return Response.json({ error: "Missing videoUrl." }, { status: 400 });
    }

    const progressContext = progressState
      ? [
          `Current active limiter: ${progressState.active_limiter || "None"}`,
          `Current experiment: ${progressState.current_experiment || "None"}`,
          `Next attempt test: ${progressState.next_attempt_test || "None"}`,
        ].join("\n")
      : "No structured progression state available.";

    const climberProfileContext = climberProfile
      ? [
          `Height: ${climberProfile.height_cm || "Unknown"} cm`,
          `Experience level: ${climberProfile.experience_level || "Unknown"}`,
          `Typical grade: ${climberProfile.typical_grade || "Unknown"}`,
          `Goals: ${climberProfile.goals?.join(", ") || "None stated"}`,
          `Known weaknesses: ${
            climberProfile.weaknesses?.join(", ") || "None stated"
          }`,
        ].join("\n")
      : "No onboarding profile available.";

    const analysisPrompt =
      attemptNumber > 1 && previousAnalysisText
        ? `You are an AI climbing coach following the same climber on the same problem.

This is Attempt ${attemptNumber}.

Previous coaching feedback:
${previousAnalysisText}

CURRENT STRUCTURED COACHING STATE:
${progressContext}

Analyze the CURRENT attempt.

First, evaluate the current experiment and next-attempt test using only what is visible in the video. Determine whether the climber actually tried the experiment and whether it appeared to help.

Do not claim improvement unless it is visible.

If the tracked experiment is no longer the most important issue, say so and identify the new limiter rather than forcing the old focus to remain active.

Respond in exactly this format:

Experiment check: <one concise sentence describing whether the tracked experiment was attempted and what happened>
What changed: <one concise sentence about meaningful change from the previous attempt>
Main issue now: <one concise sentence identifying the most important current limiter>
Next attempt: <one concise actionable sentence>`
        : attemptNumber === 1 && previousSessionFocus
          ? `You are an AI climbing coach analyzing the climber's first attempt of a new session.

A previous session ended with this suggested focus:
${previousSessionFocus}

Treat that previous focus only as something to CHECK in the current video. Do not assume the old issue is still present.

Analyze the CURRENT attempt and identify the most important limiter visible now. If the previous focus is visibly relevant, mention whether it appears improved, unchanged, or still limiting the climber. If it is not supported by the current video, do not force it into the analysis.

Respond in exactly this format:

Previous focus check: <one concise sentence about whether the previous focus is visibly relevant in this attempt>
Main issue now: <one concise sentence identifying the most important current limiter>
Next attempt: <one concise actionable sentence>`
          : `You are an AI climbing coach. Analyze this climbing attempt. Do not describe the entire video. Identify the single most important technical issue preventing progress and one specific action for the climber's very next attempt.

Respond in exactly this format:

Main issue: <one concise sentence>
Next attempt: <one concise actionable sentence>`;

    const creditsSpent = await spendCredits({
      userId: user.id,
      amount: 1,
      reason: "video_analysis",
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

    const falResponse = await fetch(
      "https://queue.fal.run/fal-ai/video-understanding",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_url: videoUrl,
          prompt: `CLIMBER PROFILE:
${climberProfileContext}

Use this profile to personalize your coaching to the climber's level, goals, and body context.

Treat self-reported weaknesses as context to CHECK against the video, not as facts. Do not claim a weakness is present unless it is visibly supported by the current attempt.

${analysisPrompt}`,
          detailed_analysis: false,
        }),
      },
    );

    const falData = await falResponse.json();

    if (!falResponse.ok) {
      console.error("fal.ai error:", falData);

      return Response.json(
        { error: "fal.ai request failed.", details: falData },
        { status: falResponse.status },
      );
    }

    return Response.json(falData);
  } catch (error) {
    console.error("Analyze route error:", error);

    return Response.json(
      { error: "Failed to submit analysis." },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");

    if (!requestId) {
      return Response.json({ error: "Missing requestId." }, { status: 400 });
    }

    const statusResponse = await fetch(
      `https://queue.fal.run/fal-ai/video-understanding/requests/${requestId}/status`,
      {
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`,
        },
      },
    );

    const statusData = await statusResponse.json();

    if (!statusResponse.ok) {
      return Response.json(
        { error: "Failed to check fal.ai status.", details: statusData },
        { status: statusResponse.status },
      );
    }

    if (statusData.status === "COMPLETED") {
      const resultResponse = await fetch(
        `https://queue.fal.run/fal-ai/video-understanding/requests/${requestId}`,
        {
          headers: {
            Authorization: `Key ${process.env.FAL_KEY}`,
          },
        },
      );

      const resultData = await resultResponse.json();

      if (!resultResponse.ok) {
        return Response.json(
          { error: "Failed to fetch fal.ai result.", details: resultData },
          { status: resultResponse.status },
        );
      }

      return Response.json({
        ...statusData,
        result: resultData,
      });
    }

    return Response.json(statusData);
  } catch (error) {
    console.error("Analyze status error:", error);

    return Response.json(
      { error: "Failed to check analysis status." },
      { status: 500 },
    );
  }
}
