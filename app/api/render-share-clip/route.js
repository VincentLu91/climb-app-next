import { renderMediaOnVercel } from "@remotion/vercel";
import { Sandbox } from "@vercel/sandbox";

import { createRequestClient, getRequestUser } from "@/lib/supabase/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  let sandbox = null;

  try {
    const {
      sessionId,
      mediaPath,
      coachingCaption,
      hook = "AI caught what was stopping this climb",
    } = await request.json();

    if (!sessionId || !mediaPath || !coachingCaption) {
      return Response.json(
        {
          error: "Missing sessionId, mediaPath, or coachingCaption.",
        },
        { status: 400 },
      );
    }

    const { supabase, accessToken } = await createRequestClient(request);

    const {
      data: { user },
      error: userError,
    } = await getRequestUser(supabase, accessToken);

    if (userError || !user) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: upload, error: uploadError } = await supabase
      .from("uploads")
      .select("id, media_path, media_type")
      .eq("user_id", user.id)
      .eq("coaching_session_id", sessionId)
      .eq("media_path", mediaPath)
      .eq("media_type", "video")
      .maybeSingle();

    if (uploadError) {
      throw uploadError;
    }

    if (!upload) {
      return Response.json(
        { error: "Video not found for this session." },
        { status: 404 },
      );
    }

    const { data: sourceUrlData, error: sourceUrlError } =
      await supabase.storage
        .from("climbing-media")
        .createSignedUrl(upload.media_path, 3600);

    if (sourceUrlError) {
      throw sourceUrlError;
    }

    const snapshotId = process.env.REMOTION_SANDBOX_SNAPSHOT_ID;

    if (!snapshotId) {
      throw new Error("Missing REMOTION_SANDBOX_SNAPSHOT_ID.");
    }

    sandbox = await Sandbox.create({
      source: {
        type: "snapshot",
        snapshotId,
      },
      timeout: 5 * 60 * 1000,
    });

    const { sandboxFilePath } = await renderMediaOnVercel({
      sandbox,
      compositionId: "ShareClip",
      inputProps: {
        videoSrc: sourceUrlData.signedUrl,
        hook,
        coachingCaption,
      },
    });

    const renderedBuffer = await sandbox.readFileToBuffer({
      path: sandboxFilePath,
    });

    if (!renderedBuffer) {
      throw new Error("Rendered MP4 could not be read from Sandbox.");
    }

    const outputPath =
      `${user.id}/generated-clips/${sessionId}/` +
      `${Date.now()}-share-clip.mp4`;

    const { error: storageError } = await supabase.storage
      .from("climbing-media")
      .upload(outputPath, renderedBuffer, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (storageError) {
      throw storageError;
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("climbing-media")
        .createSignedUrl(outputPath, 3600);

    if (signedUrlError) {
      throw signedUrlError;
    }

    return Response.json({
      mediaPath: outputPath,
      signedUrl: signedUrlData.signedUrl,
    });
  } catch (error) {
    console.error("Render share clip error:", error);

    return Response.json(
      {
        error: "Failed to render share clip.",
      },
      { status: 500 },
    );
  } finally {
    if (sandbox) {
      await sandbox.stop().catch((error) => {
        console.error("Failed to stop Remotion Sandbox:", error);
      });
    }
  }
}
