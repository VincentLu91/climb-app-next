"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";

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

    const { data: progressState, error: progressStateError } = await supabase
      .from("climber_progress_state")
      .select("active_limiter, current_experiment, next_attempt_test")
      .eq("user_id", user.id)
      .maybeSingle();

    if (progressStateError) {
      console.error(
        "Failed to load climber progress state:",
        progressStateError,
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

    posthog.capture(
      "coaching_session_started",
      {
        session_id: session.id,
        has_existing_progress: Boolean(progressState?.active_limiter),
      },
      {
        transport: "sendBeacon",
        send_instantly: true,
      },
    );

    const kickoffMessage = progressState?.active_limiter
      ? "I've carried your current coaching focus forward. What are you working on today? You can tell me, send a photo of the wall or problem, or send your first attempt."
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
