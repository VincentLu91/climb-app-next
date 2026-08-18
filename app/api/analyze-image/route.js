import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const { imageUrl, prompt } = await request.json();

    if (!imageUrl) {
      return Response.json({ error: "Missing imageUrl." }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let progressState = null;

    if (user) {
      const { data, error } = await supabase
        .from("climber_progress_state")
        .select("active_limiter, current_experiment, next_attempt_test")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load climber progress for image:", error);
      } else {
        progressState = data;
      }
    }

    const progressContext = progressState
      ? `Current limiter: ${progressState.active_limiter || "None"}
Current experiment: ${progressState.current_experiment || "None"}
Next attempt test: ${progressState.next_attempt_test || "None"}`
      : "No current progression state is available.";

    const falResponse = await fetch(
      "https://fal.run/openrouter/router/vision",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_urls: [imageUrl],
          model: "google/gemini-2.5-flash",
          system_prompt:
            "You are an AI climbing coach analyzing a photo of a climbing wall or problem. Use only what is visibly supported by the image and the climber's supplied context. You may identify the intended problem by its stated hold color. Do not infer the start hold, finish hold, route order, beta, grade, or exact hold type unless it is clearly supported by visible markings or unmistakable geometry. If something is uncertain, describe the hold by location and appearance instead of assigning a technical hold type. Use plain text only.",
          prompt: `CLIMBER'S CURRENT PROGRESSION STATE:
${progressContext}

CLIMBER'S MESSAGE:
${prompt || "No additional context provided."}

Analyze the selected climbing problem using the climber's message and the image.

First identify only the visually supported characteristics of the intended problem.

Then determine whether the image alone provides enough evidence to connect the problem to the climber's current limiter, experiment, or next-attempt test.

Do not infer movement demands, required technique, reach difficulty, body position, or training value solely from hold placement.

Only connect the problem to the climber's current progression state when that connection is strongly supported by visible evidence.

If the image is not sufficient, say that clearly and recommend that the climber send their first attempt so the coach can evaluate the current focus against actual climbing evidence.

Do not invent beta, movement sequence, start/finish holds, grade, or exact hold types.

If the route's relevance to the current focus cannot be determined reliably from the image, say so plainly.

Keep the response concise and useful for deciding what to work on.`,
          temperature: 0,
        }),
      },
    );

    const falData = await falResponse.json();

    if (!falResponse.ok) {
      console.error("fal.ai image analysis error:", falData);

      return Response.json(
        {
          error: "fal.ai image analysis failed.",
          details: falData,
        },
        { status: falResponse.status },
      );
    }

    return Response.json({
      output: falData.output,
    });
  } catch (error) {
    console.error("Analyze image route error:", error);

    return Response.json(
      { error: "Failed to analyze image." },
      { status: 500 },
    );
  }
}
