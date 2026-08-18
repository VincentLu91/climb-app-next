"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

async function getFileHash(file) {
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const UploadForm = forwardRef(function UploadForm(
  {
    initialCoachingSessionId = null,
    composerMode = false,
    messageText = "",
    onAttachmentSent,
  },
  ref,
) {
  const supabase = createClient();
  const router = useRouter();

  const [file, setFile] = useState(null);
  const [analysisResult, setAnalysisResult] = useState("");

  const [coachingSessionId, setCoachingSessionId] = useState(
    initialCoachingSessionId,
  );
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [awaitingAttemptChoice, setAwaitingAttemptChoice] = useState(false);
  const [sessionFileHashes, setSessionFileHashes] = useState([]);

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] ?? null;

    if (composerMode && awaitingAttemptChoice && selectedFile) {
      setAwaitingAttemptChoice(false);
    }

    setFile(selectedFile);
  }

  useEffect(() => {
    async function loadCoachingSessionState() {
      if (!initialCoachingSessionId) {
        return;
      }

      const supabase = createClient();

      const { data, error } = await supabase
        .from("uploads")
        .select("id, attempt_number, file_hash")
        .eq("coaching_session_id", initialCoachingSessionId)
        .order("attempt_number", { ascending: true });

      if (error) {
        console.error("Failed to load coaching session attempts:", error);
        return;
      }

      const lastUpload = data?.at(-1);
      const lastAttempt = lastUpload?.attempt_number ?? 0;

      setAttemptNumber(lastAttempt + 1);
      setSessionFileHashes(
        data?.map((upload) => upload.file_hash).filter(Boolean) ?? [],
      );

      if (lastUpload) {
        const { data: latestAnalysis, error: latestAnalysisError } =
          await supabase
            .from("analyses")
            .select("result")
            .eq("upload_id", lastUpload.id)
            .eq("status", "completed")
            .maybeSingle();

        if (latestAnalysisError) {
          console.error(
            "Failed to load latest coaching feedback:",
            latestAnalysisError,
          );
          return;
        }

        setAnalysisResult(latestAnalysis?.result ?? "");
        setAwaitingAttemptChoice(Boolean(latestAnalysis?.result));
      }
    }

    loadCoachingSessionState();
  }, [initialCoachingSessionId]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      alert("Choose a file first.");
      return;
    }

    const currentFileHash = await getFileHash(file);

    if (sessionFileHashes.includes(currentFileHash)) {
      alert("You've already submitted this video for this problem.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be logged in.");
      return;
    }

    let activeCoachingSessionId = coachingSessionId;

    if (!activeCoachingSessionId) {
      const { data: sessionRow, error: sessionError } = await supabase
        .from("coaching_sessions")
        .insert({
          user_id: user.id,
        })
        .select()
        .single();

      if (sessionError) {
        console.error("Failed to create coaching session:", sessionError);
        alert("Failed to start coaching session.");
        return;
      }

      activeCoachingSessionId = sessionRow.id;
      setCoachingSessionId(sessionRow.id);
    }

    let previousUploadRow = null;
    let previousAnalysisText = null;
    let previousSessionFocus = null;

    if (attemptNumber === 1) {
      const { data: previousSession, error: previousSessionError } =
        await supabase
          .from("coaching_sessions")
          .select("next_session_focus")
          .eq("user_id", user.id)
          .not("ended_at", "is", null)
          .not("next_session_focus", "is", null)
          .order("ended_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (previousSessionError) {
        console.error(
          "Failed to load previous session focus:",
          previousSessionError,
        );
      }

      previousSessionFocus = previousSession?.next_session_focus ?? null;
    }

    if (attemptNumber > 1) {
      const { data, error } = await supabase
        .from("uploads")
        .select("id, attempt_number")
        .eq("coaching_session_id", activeCoachingSessionId)
        .lt("attempt_number", attemptNumber)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Failed to load previous attempt:", error);
        alert("Failed to load the previous attempt.");
        return;
      }

      previousUploadRow = data;

      if (previousUploadRow) {
        const { data: previousAnalysis, error: previousAnalysisError } =
          await supabase
            .from("analyses")
            .select("result")
            .eq("upload_id", previousUploadRow.id)
            .eq("status", "completed")
            .maybeSingle();

        if (previousAnalysisError) {
          console.error(
            "Failed to load previous analysis:",
            previousAnalysisError,
          );
          alert("Failed to load the previous coaching feedback.");
          return;
        }

        previousAnalysisText = previousAnalysis?.result ?? null;
      }
    }

    const filePath = `${user.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("climbing-media")
      .upload(filePath, file, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      alert("Failed to upload file.");
      return;
    }

    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    const { data: uploadRow, error: databaseError } = await supabase
      .from("uploads")
      .insert({
        user_id: user.id,
        media_path: filePath,
        media_type: mediaType,
        coaching_session_id: activeCoachingSessionId,
        attempt_number: mediaType === "video" ? attemptNumber : null,
        file_hash: currentFileHash,
      })
      .select()
      .single();

    if (databaseError) {
      console.error("Database insert error:", databaseError);
      alert("File uploaded, but database record failed.");
      return;
    }

    const { error: saveUploadChatError } = await supabase
      .from("chat_history")
      .insert({
        user_id: user.id,
        coaching_session_id: activeCoachingSessionId,
        upload_id: uploadRow.id,
        message:
          messageText.trim() ||
          (mediaType === "video"
            ? `Attempt ${attemptNumber}`
            : "Wall/problem photo"),
        sender: "User",
      });

    if (saveUploadChatError) {
      console.error(
        "Failed to save uploaded attempt to chat:",
        saveUploadChatError,
      );
    }

    const { data: analysisRow, error: analysisError } = await supabase
      .from("analyses")
      .insert({
        upload_id: uploadRow.id,
        status: "pending",
      })
      .select()
      .single();

    if (analysisError) {
      console.error("Analysis insert error:", analysisError);
      alert("Upload saved, but analysis record failed.");
      return;
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("climbing-media")
        .createSignedUrl(filePath, 3600);

    if (signedUrlError) {
      console.error("Signed URL error:", signedUrlError);
      alert("Upload saved, but media URL creation failed.");
      return;
    }

    if (composerMode && !saveUploadChatError) {
      window.dispatchEvent(
        new CustomEvent("climbing-user-attachment", {
          detail: {
            message:
              messageText.trim() ||
              (mediaType === "video"
                ? `Attempt ${attemptNumber}`
                : "Wall/problem photo"),
            uploadId: uploadRow.id,
            attachment: {
              media_path: filePath,
              media_type: mediaType,
              attempt_number: mediaType === "video" ? attemptNumber : null,
              signedUrl: signedUrlData.signedUrl,
            },
          },
        }),
      );

      setFile(null);
      onAttachmentSent?.();
    }

    if (mediaType === "video") {
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl: signedUrlData.signedUrl,
          attemptNumber,
          previousAnalysisText,
          previousSessionFocus,
        }),
      });

      const analyzeData = await analyzeResponse.json();

      if (!analyzeResponse.ok) {
        console.error("Analyze API error:", analyzeData);
        alert("Upload saved, but AI analysis submission failed.");
        return;
      }

      console.log("fal.ai submission:", analyzeData);

      let completedAnalysis = null;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        const statusResponse = await fetch(
          `/api/analyze?requestId=${analyzeData.request_id}`,
        );

        const statusData = await statusResponse.json();

        if (!statusResponse.ok) {
          console.error("Analyze status error:", statusData);
          alert("AI analysis was submitted, but status check failed.");
          return;
        }

        console.log("fal.ai status:", statusData);

        if (statusData.status === "COMPLETED") {
          completedAnalysis = statusData;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!completedAnalysis) {
        alert("AI analysis is still processing.");
        return;
      }

      console.log("fal.ai completed result:", completedAnalysis.result);

      const analysisText = completedAnalysis.result?.output;

      if (!analysisText) {
        alert("AI analysis completed, but no result text was returned.");
        return;
      }

      const { error: saveAnalysisError } = await supabase
        .from("analyses")
        .update({
          status: "completed",
          result: analysisText,
          model_provider: "fal.ai",
          model_name: "fal-ai/video-understanding",
          completed_at: new Date().toISOString(),
        })
        .eq("id", analysisRow.id);

      if (saveAnalysisError) {
        console.error("Failed to save analysis result:", saveAnalysisError);
        alert("AI analysis completed, but saving the result failed.");
        return;
      }

      const progressResponse = await fetch("/api/update-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisText,
        }),
      });

      const progressData = await progressResponse.json();

      if (!progressResponse.ok) {
        console.error("Progress update failed:", progressData);
      } else {
        console.log("Progress state:", progressData.updatedState);

        window.dispatchEvent(
          new CustomEvent("climbing-progress-update", {
            detail: {
              active_limiter: progressData.updatedState.activeLimiter,
              progress_note: progressData.updatedState.progressNote,
              current_experiment: progressData.updatedState.currentExperiment,
              next_attempt_test: progressData.updatedState.nextAttemptTest,
            },
          }),
        );
      }

      const { data: savedCoachMessage, error: saveChatError } = await supabase
        .from("chat_history")
        .insert({
          user_id: user.id,
          coaching_session_id: activeCoachingSessionId,
          message: analysisText,
          sender: "ChatGPT",
        })
        .select("id")
        .single();

      if (saveChatError) {
        console.error(
          "Failed to save coaching feedback to chat:",
          saveChatError,
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("climbing-coach-message", {
            detail: {
              id: savedCoachMessage.id,
              message: analysisText,
              coachingHelpful: null,
            },
          }),
        );
      }

      setAnalysisResult(analysisText);
      setSessionFileHashes((currentHashes) => [
        ...currentHashes,
        currentFileHash,
      ]);

      if (composerMode) {
        setAttemptNumber((currentAttempt) => currentAttempt + 1);
      }

      setAwaitingAttemptChoice(true);

      console.log("Saved analysis result:", analysisText);
    }

    if (mediaType === "image") {
      const imageResponse = await fetch("/api/analyze-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: signedUrlData.signedUrl,
          prompt: `This image was sent by a climber during an active coaching session.

USER CONTEXT:
${
  messageText || "The climber did not specify which route or problem they mean."
}

Treat the image as wall or problem context, not as a climbing attempt.

If the climber specifies a route color, treat the visible holds of that color as the intended climbing problem.

Do not confuse multiple holds of the same color with multiple routes.

Only ask for clarification if the image clearly contains more than one separate problem using the same specified color, or if the requested color cannot be identified reliably in the image.

Describe only what is visibly useful for coaching. Do not invent a route sequence, grade, hold type, or movement that cannot be supported by the image.

Give a concise response that helps the climber decide what to work on or what to try next.`,
        }),
      });

      const imageData = await imageResponse.json();

      if (!imageResponse.ok) {
        console.error("Image analysis error:", imageData);
        alert("Photo uploaded, but image analysis failed.");
        return;
      }

      const analysisText = imageData.output;

      if (!analysisText) {
        alert("Photo analysis completed, but no result text was returned.");
        return;
      }

      const { error: saveImageAnalysisError } = await supabase
        .from("analyses")
        .update({
          status: "completed",
          result: analysisText,
          model_provider: "fal.ai",
          model_name: "openrouter/router/vision",
          completed_at: new Date().toISOString(),
        })
        .eq("id", analysisRow.id);

      if (saveImageAnalysisError) {
        console.error("Failed to save image analysis:", saveImageAnalysisError);
        return;
      }

      const { data: savedImageCoachMessage, error: saveImageChatError } =
        await supabase
          .from("chat_history")
          .insert({
            user_id: user.id,
            coaching_session_id: activeCoachingSessionId,
            message: analysisText,
            sender: "ChatGPT",
          })
          .select("id")
          .single();

      if (saveImageChatError) {
        console.error(
          "Failed to save image coaching response:",
          saveImageChatError,
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("climbing-coach-message", {
            detail: {
              id: savedImageCoachMessage.id,
              message: analysisText,
              coachingHelpful: null,
            },
          }),
        );
      }
    }

    console.log("Created upload row:", uploadRow);
    console.log("Created analysis row:", analysisRow);
    console.log("Signed media URL:", signedUrlData.signedUrl);

    alert("Upload and analysis record saved.");
  }

  function handleNextAttempt() {
    if (!initialCoachingSessionId && coachingSessionId) {
      router.push(`/session/${coachingSessionId}`);
      return;
    }

    setAttemptNumber((currentAttempt) => currentAttempt + 1);
    setFile(null);
    setAwaitingAttemptChoice(false);
  }

  function handleNewProblem() {
    setCoachingSessionId(null);
    setAttemptNumber(1);
    setFile(null);
    setAnalysisResult("");
    setSessionFileHashes([]);
    setAwaitingAttemptChoice(false);

    if (initialCoachingSessionId) {
      router.push("/upload");
    }
  }

  useImperativeHandle(ref, () => ({
    hasFile: Boolean(file),

    submitAttachment: async () => {
      if (!file) {
        return;
      }

      await handleSubmit({
        preventDefault() {},
      });
    },
  }));

  return (
    <form onSubmit={handleSubmit}>
      {(!awaitingAttemptChoice || composerMode) && (
        <>
          <input
            id={`climbing-media-${coachingSessionId ?? "new"}-${attemptNumber}`}
            key={`${coachingSessionId}-${attemptNumber}`}
            type="file"
            accept="image/*,video/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            style={composerMode ? { display: "none" } : undefined}
          />

          {composerMode ? (
            <label
              htmlFor={`climbing-media-${
                coachingSessionId ?? "new"
              }-${attemptNumber}`}
            >
              {file ? file.name : "Attach photo/video"}
            </label>
          ) : (
            file && <p>Selected: {file.name}</p>
          )}

          {!composerMode && <button type="submit">Upload</button>}
        </>
      )}

      {analysisResult && (
        <div>
          {!initialCoachingSessionId && (
            <>
              <h2>Climbing Feedback</h2>
              <p>{analysisResult}</p>
            </>
          )}

          {awaitingAttemptChoice && (
            <div>
              {!composerMode && (
                <button type="button" onClick={handleNextAttempt}>
                  Next attempt on this problem
                </button>
              )}

              {!composerMode && (
                <button type="button" onClick={handleNewProblem}>
                  Start a different problem
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
});

export default UploadForm;
