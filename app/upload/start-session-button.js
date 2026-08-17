"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StartSessionButton() {
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  async function startSession() {
    if (starting) {
      return;
    }

    setStarting(true);

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStarting(false);
      return;
    }

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
        "Failed to load previous session learning:",
        previousSessionError,
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("coaching_sessions")
      .insert({
        user_id: user.id,
      })
      .select("id")
      .single();

    if (sessionError) {
      console.error("Failed to start coaching session:", sessionError);
      setStarting(false);
      return;
    }

    const kickoffMessage = previousSession?.next_session_focus
      ? `Last session, your main focus for next time was: ${previousSession.next_session_focus}

What are you working on today? You can tell me, send a photo of the wall or problem, or send your first attempt.`
      : "What are you working on today? You can tell me, send a photo of the wall or problem, or send your first attempt.";

    const { error: messageError } = await supabase.from("chat_history").insert({
      user_id: user.id,
      coaching_session_id: session.id,
      sender: "ChatGPT",
      message: kickoffMessage,
    });

    if (messageError) {
      console.error("Failed to create session kickoff:", messageError);
    }

    router.push(`/session/${session.id}`);
  }

  return (
    <button type="button" onClick={startSession} disabled={starting}>
      {starting ? "Starting..." : "Start coaching session"}
    </button>
  );
}
