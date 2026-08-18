"use client";

import { useState } from "react";
import { renderMediaOnWeb } from "@remotion/web-renderer";
import { ShareClip } from "@/remotion/Composition";

export default function ShareClipButton({ videoSrc, coachingCaption }) {
  const [renderedFile, setRenderedFile] = useState(null);
  const [isRendering, setIsRendering] = useState(false);

  async function handleGenerate() {
    setIsRendering(true);
    const { getBlob } = await renderMediaOnWeb({
      composition: {
        id: "ShareClip",
        component: ShareClip,
        durationInFrames: 150,
        fps: 30,
        width: 1080,
        height: 1920,
      },
      inputProps: {
        videoSrc,
        hook: "AI caught what was stopping this climb",
        coachingCaption,
      },
    });

    const blob = await getBlob();

    const file = new File([blob], "climbing-share-clip.mp4", {
      type: "video/mp4",
    });

    setRenderedFile(file);

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "climbing-share-clip.mp4";
    link.click();

    URL.revokeObjectURL(url);
    setIsRendering(false);
  }

  async function handleShare() {
    if (!renderedFile) {
      return;
    }

    if (navigator.canShare && navigator.canShare({ files: [renderedFile] })) {
      try {
        await navigator.share({
          files: [renderedFile],
          title: "Climbing coaching clip",
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Failed to share clip:", error);
        }
      }
    }
  }

  if (!videoSrc || !coachingCaption) {
    return <p>Complete an analyzed attempt to generate a share clip.</p>;
  }

  return (
    <>
      <button type="button" onClick={handleGenerate} disabled={isRendering}>
        {isRendering ? "Rendering..." : "Generate share clip"}
      </button>

      {renderedFile && (
        <button type="button" onClick={handleShare}>
          Share clip
        </button>
      )}
    </>
  );
}
