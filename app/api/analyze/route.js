export async function POST(request) {
  try {
    const {
      videoUrl,
      attemptNumber,
      previousAnalysisText,
      previousSessionFocus,
    } = await request.json();

    if (!videoUrl) {
      return Response.json({ error: "Missing videoUrl." }, { status: 400 });
    }

    const analysisPrompt =
      attemptNumber > 1 && previousAnalysisText
        ? `You are an AI climbing coach following the same climber on the same problem.

This is Attempt ${attemptNumber}.

Previous coaching feedback:
${previousAnalysisText}

Analyze the CURRENT attempt. Focus on whether the climber addressed the previous issue. Do not claim improvement unless it is visible in the current video.

Respond in exactly this format:

What changed: <one concise sentence about whether the previous issue improved, stayed the same, or worsened>
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
          prompt: analysisPrompt,
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
