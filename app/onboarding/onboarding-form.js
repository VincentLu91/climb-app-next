"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";

export default function OnboardingForm({ userId }) {
  const [displayName, setDisplayName] = useState("");

  const router = useRouter();

  async function handleSubmit(event) {
    event.preventDefault();

    const supabase = createClient();

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: displayName,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.refresh();

    alert("Profile created.");
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Display name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />

      <button type="submit">Continue</button>
    </form>
  );
}
