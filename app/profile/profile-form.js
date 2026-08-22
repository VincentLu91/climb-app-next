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

  async function handleManageBilling() {
    const response = await fetch("/api/customer-portal", {
      method: "POST",
    });

    const data = await response.json();

    if (response.ok && data.url) {
      window.location.href = data.url;
      return;
    }

    if (data.error?.includes("No Stripe customer found")) {
      window.location.href = "/pricing";
      return;
    }

    alert(data.error || "Unable to open billing portal.");
  }

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <div className="profile-form-heading">
        <div>
          <p className="eyebrow">SESSION CONTEXT</p>
          <h2>What should the coach know?</h2>
        </div>
        <span className="profile-form-index">EDIT / 06</span>
      </div>

      <div className="profile-fields">
        <label className="profile-field profile-field-wide">
          <span>Name</span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        <label className="profile-field">
          <span>Height (cm)</span>
          <input
            type="number"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
          />
        </label>

        <label className="profile-field">
          <span>Experience level</span>
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

        <label className="profile-field">
          <span>Typical grade</span>
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

        <label className="profile-field">
          <span>Main goal</span>
          <select value={goal} onChange={(event) => setGoal(event.target.value)}>
            {goalOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="profile-field profile-field-wide">
          <span>Recurring weakness</span>
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
      </div>

      <div className="profile-form-actions">
        <button className="profile-save" type="submit">
          <span>Save changes</span>
          <span aria-hidden="true">→</span>
        </button>
        <button className="profile-billing" type="button" onClick={handleManageBilling}>
          Manage billing <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}
