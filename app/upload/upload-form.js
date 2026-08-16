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

    console.log("Created upload row:", uploadRow);
    alert("Upload saved.");
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
