"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";

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

export default function OnboardingForm({ userId }) {
  const [displayName, setDisplayName] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [typicalGrade, setTypicalGrade] = useState("");
  const [goal, setGoal] = useState("");
  const [weakness, setWeakness] = useState("");

  const [step, setStep] = useState(0);

  const totalSteps = 6;

  const router = useRouter();

  function handleNext() {
    setStep((currentStep) => Math.min(currentStep + 1, totalSteps - 1));
  }

  function handleBack() {
    setStep((currentStep) => Math.max(currentStep - 1, 0));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const supabase = createClient();

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: displayName,
      height_cm: heightCm ? Number(heightCm) : null,
      experience_level: experienceLevel,
      typical_grade: typicalGrade,
      goals: goal ? [goal] : [],
      weaknesses: weakness ? [weakness] : [],
      onboarding_version: 1,
      onboarded_at: new Date().toISOString(),
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/upload");
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>
        Step {step + 1} of {totalSteps}
      </p>

      {step === 0 && (
        <div>
          <h2>What should your coach call you?</h2>

          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <button
            type="button"
            onClick={handleNext}
            disabled={!displayName.trim()}
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2>How experienced are you with climbing?</h2>
          <p>This helps your coach tailor feedback to your current level.</p>

          {experienceOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setExperienceLevel(option);
                handleNext();
              }}
            >
              {option}
            </button>
          ))}

          <button type="button" onClick={handleBack}>
            Back
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>What grade do you usually climb?</h2>
          <p>Choose the range that best represents your normal sessions.</p>

          {gradeOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setTypicalGrade(option);
                handleNext();
              }}
            >
              {option}
            </button>
          ))}

          <button type="button" onClick={handleBack}>
            Back
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>How tall are you?</h2>
          <p>
            Your height can affect reach, positioning, and movement options.
          </p>

          <input
            type="number"
            placeholder="Height in cm"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
          />

          <button type="button" onClick={handleNext} disabled={!heightCm}>
            Continue
          </button>

          <button type="button" onClick={handleBack}>
            Back
          </button>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2>What do you want to achieve with your climbing?</h2>
          <p>
            Your coach will use this to keep feedback aligned with your goals.
          </p>

          {goalOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setGoal(option);
                handleNext();
              }}
            >
              {option}
            </button>
          ))}

          <button type="button" onClick={handleBack}>
            Back
          </button>
        </div>
      )}

      {step === 5 && (
        <div>
          <h2>What tends to hold you back most?</h2>
          <p>
            Your coach will treat this as context, then check whether it
            actually appears in your climbing.
          </p>

          {weaknessOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWeakness(option)}
            >
              {option}
            </button>
          ))}

          <button type="button" onClick={handleBack}>
            Back
          </button>

          <button type="submit" disabled={!weakness}>
            Build my coaching profile
          </button>
        </div>
      )}
    </form>
  );
}
