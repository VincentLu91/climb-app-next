"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

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
  const onboardingStartedTracked = useRef(false);

  useEffect(() => {
    if (onboardingStartedTracked.current) {
      return;
    }

    onboardingStartedTracked.current = true;

    posthog.capture(
      "onboarding_started",
      {
        onboarding_version: 1,
      },
      {
        send_instantly: true,
      },
    );
  }, []);

  function handleNext() {
    posthog.capture("onboarding_step_completed", {
      onboarding_version: 1,
      step_number: step + 1,
    });

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

    posthog.capture(
      "onboarding_step_completed",
      {
        onboarding_version: 1,
        step_number: 6,
      },
      {
        send_instantly: true,
      },
    );

    posthog.capture(
      "onboarding_completed",
      {
        onboarding_version: 1,
        total_steps: totalSteps,
      },
      {
        send_instantly: true,
      },
    );

    router.push("/upload");
  }

  const stepMeta = [
    ["Your name", "A little context helps the coach keep the session personal."],
    ["Experience", "This helps your coach tailor feedback to your current level."],
    ["Typical grade", "Choose the range that best represents your normal sessions."],
    ["Reach context", "Height can affect reach, positioning, and movement options."],
    ["Your goal", "Keep feedback aligned with what you want from climbing."],
    ["Your limiter", "Start with a hypothesis, then let your climbing confirm it."],
  ];

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <div className="onboarding-progress-row">
        <span>Step {step + 1} of {totalSteps}</span>
        <span>{stepMeta[step][0]}</span>
      </div>
      <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${totalSteps}`}>
        <span style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
      </div>

      <div className="onboarding-step">
        <p className="onboarding-kicker">Build your coaching context</p>

        {step === 0 && (
          <div className="onboarding-question">
            <h2>What should your coach call you?</h2>
            <p>{stepMeta[0][1]}</p>
            <input
              autoFocus
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <button className="onboarding-primary" type="button" onClick={handleNext} disabled={!displayName.trim()}>
              Continue <span>→</span>
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-question">
            <h2>How experienced are you with climbing?</h2>
            <p>{stepMeta[1][1]}</p>
            <div className="onboarding-options onboarding-options-3">
              {experienceOptions.map((option) => (
                <button className={`onboarding-option ${experienceLevel === option ? "is-selected" : ""}`} key={option} type="button" onClick={() => { setExperienceLevel(option); handleNext(); }}>
                  <span>{option}</span><b>→</b>
                </button>
              ))}
            </div>
            <button className="onboarding-back" type="button" onClick={handleBack}>← Back</button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-question">
            <h2>What grade do you usually climb?</h2>
            <p>{stepMeta[2][1]}</p>
            <div className="onboarding-options onboarding-options-5">
              {gradeOptions.map((option) => (
                <button className={`onboarding-option ${typicalGrade === option ? "is-selected" : ""}`} key={option} type="button" onClick={() => { setTypicalGrade(option); handleNext(); }}>
                  <span>{option}</span><b>→</b>
                </button>
              ))}
            </div>
            <button className="onboarding-back" type="button" onClick={handleBack}>← Back</button>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-question">
            <h2>How tall are you?</h2>
            <p>{stepMeta[3][1]}</p>
            <input autoFocus type="number" placeholder="Height in cm" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} />
            <button className="onboarding-primary" type="button" onClick={handleNext} disabled={!heightCm}>Continue <span>→</span></button>
            <button className="onboarding-back" type="button" onClick={handleBack}>← Back</button>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-question">
            <h2>What do you want to achieve with your climbing?</h2>
            <p>{stepMeta[4][1]}</p>
            <div className="onboarding-options">
              {goalOptions.map((option) => (
                <button className={`onboarding-option ${goal === option ? "is-selected" : ""}`} key={option} type="button" onClick={() => { setGoal(option); handleNext(); }}>
                  <span>{option}</span><b>→</b>
                </button>
              ))}
            </div>
            <button className="onboarding-back" type="button" onClick={handleBack}>← Back</button>
          </div>
        )}

        {step === 5 && (
          <div className="onboarding-question">
            <h2>What tends to hold you back most?</h2>
            <p>{stepMeta[5][1]}</p>
            <div className="onboarding-options">
              {weaknessOptions.map((option) => (
                <button className={`onboarding-option ${weakness === option ? "is-selected" : ""}`} key={option} type="button" onClick={() => setWeakness(option)}>
                  <span>{option}</span><b>→</b>
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="onboarding-back" type="button" onClick={handleBack}>← Back</button>
              <button className="onboarding-primary" type="submit" disabled={!weakness}>Build my coaching profile <span>→</span></button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
