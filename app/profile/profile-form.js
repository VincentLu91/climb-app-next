"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

import { createClient } from "@/lib/supabase/client";

const experienceOptions = ["Beginner", "Intermediate", "Advanced"];

const gradeOptions = ["V0-V1", "V2-V3", "V4-V5", "V6-V7", "V8+"];

const goalOptions = [
  "Improve technique",
  "Break through a plateau",
  "Climb harder grades",
  "Send a specific project",
  "Become a stronger all-around climber",
];

const weaknessOptions = [
  "Body positioning",
  "Footwork",
  "Long reaches",
  "Power",
  "Endurance",
  "Route reading",
  "Not sure yet",
];

export default function ProfileForm({ userId, profile }) {
  const coachingProfileViewedTracked = useRef(false);

  useEffect(() => {
    if (coachingProfileViewedTracked.current) {
      return;
    }

    coachingProfileViewedTracked.current = true;

    posthog.capture(
      "coaching_profile_viewed",
      {
        onboarding_version: 1,
      },
      {
        send_instantly: true,
      },
    );
  }, []);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [heightCm, setHeightCm] = useState(profile?.height_cm ?? "");
  const [experienceLevel, setExperienceLevel] = useState(
    profile?.experience_level ?? "",
  );
  const [typicalGrade, setTypicalGrade] = useState(
    profile?.typical_grade ?? "",
  );
  const [goal, setGoal] = useState(profile?.goals?.[0] ?? "");
  const [weakness, setWeakness] = useState(profile?.weaknesses?.[0] ?? "");

  async function handleSubmit(event) {
    event.preventDefault();

    const supabase = createClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        height_cm: heightCm ? Number(heightCm) : null,
        experience_level: experienceLevel,
        typical_grade: typicalGrade,
        goals: goal ? [goal] : [],
        weaknesses: weakness ? [weakness] : [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Profile updated.");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>

      <label>
        Height (cm)
        <input
          type="number"
          value={heightCm}
          onChange={(event) => setHeightCm(event.target.value)}
        />
      </label>

      <label>
        Experience level
        <select
          value={experienceLevel}
          onChange={(event) => setExperienceLevel(event.target.value)}
        >
          {experienceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Typical grade
        <select
          value={typicalGrade}
          onChange={(event) => setTypicalGrade(event.target.value)}
        >
          {gradeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Main goal
        <select value={goal} onChange={(event) => setGoal(event.target.value)}>
          {goalOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Recurring weakness
        <select
          value={weakness}
          onChange={(event) => setWeakness(event.target.value)}
        >
          {weaknessOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <button type="submit">Save changes</button>
    </form>
  );
}
