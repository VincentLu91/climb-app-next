"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

async function getFileHash(file) {
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function UploadForm({ initialCoachingSessionId = null }) {
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
        attempt_number: attemptNumber,
        file_hash: currentFileHash,
      })
      .select()
      .single();

    if (databaseError) {
      console.error("Database insert error:", databaseError);
      alert("File uploaded, but database record failed.");
      return;
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

      const { error: saveChatError } = await supabase
        .from("chat_history")
        .insert({
          user_id: user.id,
          coaching_session_id: activeCoachingSessionId,
          message: analysisText,
          sender: "ChatGPT",
        });

      if (saveChatError) {
        console.error(
          "Failed to save coaching feedback to chat:",
          saveChatError,
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("climbing-coach-message", {
            detail: {
              message: analysisText,
            },
          }),
        );
      }

      setAnalysisResult(analysisText);
      setSessionFileHashes((currentHashes) => [
        ...currentHashes,
        currentFileHash,
      ]);
      setAwaitingAttemptChoice(true);

      console.log("Saved analysis result:", analysisText);
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

  return (
    <form onSubmit={handleSubmit}>
      {!awaitingAttemptChoice && (
        <>
          <input
            key={`${coachingSessionId}-${attemptNumber}`}
            type="file"
            accept="image/*,video/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />

          {file && <p>Selected: {file.name}</p>}

          <button type="submit">Upload</button>
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
              <button type="button" onClick={handleNextAttempt}>
                Next attempt on this problem
              </button>

              <button type="button" onClick={handleNewProblem}>
                Start a different problem
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
