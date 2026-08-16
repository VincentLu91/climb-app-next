export async function POST(request) {
  try {
    const { videoUrl } = await request.json();

    if (!videoUrl) {
      return Response.json({ error: "Missing videoUrl." }, { status: 400 });
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
          prompt:
            "Analyze this climbing attempt. Identify the main technical issue and give one specific adjustment for the climber's next attempt.",
          detailed_analysis: true,
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
