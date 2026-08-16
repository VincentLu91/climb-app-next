"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UploadForm() {
  const supabase = createClient();

  const [file, setFile] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      alert("Choose a file first.");
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

      console.log("Saved analysis result:", analysisText);
    }

    console.log("Created upload row:", uploadRow);
    console.log("Created analysis row:", analysisRow);
    console.log("Signed media URL:", signedUrlData.signedUrl);

    alert("Upload and analysis record saved.");
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />

      {file && <p>Selected: {file.name}</p>}

      <button type="submit">Upload</button>
    </form>
  );
}
