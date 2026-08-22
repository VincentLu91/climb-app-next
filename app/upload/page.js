import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import UploadForm from "./upload-form";
import StartSessionButton from "./start-session-button";
import CheckoutSuccessTracker from "./checkout-success-tracker";
import AuthenticatedNavbar from "@/components/authenticated-navbar";

export default async function UploadPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: progressState, error: progressStateError } = await supabase
    .from("climber_progress_state")
    .select(
      "active_limiter, progress_note, current_experiment, next_attempt_test",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (progressStateError) {
    console.error("Failed to load climber progress:", progressStateError);
  }

  const { data: recentSessions, error: recentSessionsError } = await supabase
    .from("coaching_sessions")
    .select(
      `
    id,
    started_at,
    session_summary,
    next_session_focus,
    uploads!inner (
      id
    )
  `,
    )
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(5);

  if (recentSessionsError) {
    console.error("Failed to load recent sessions:", recentSessionsError);
  }

  const focusItems = [
    ["Limiter", progressState?.active_limiter],
    ["Progress", progressState?.progress_note],
    ["Current test", progressState?.current_experiment],
    ["Next attempt", progressState?.next_attempt_test],
  ].filter(([, value]) => value);

  return (
    <>
      <CheckoutSuccessTracker />
      <AuthenticatedNavbar />

      <main className="upload-shell">
        <section className="upload-hero" aria-labelledby="upload-title">
          <div className="upload-hero-copy">
            <p className="eyebrow">ADAPTIVE CLIMBING COACH</p>
            <h1 id="upload-title">
              Bring the wall.
              <br />
              <em>We&apos;ll find the next move.</em>
            </h1>
            <p className="intro-copy">
              Start with a conversation or send your first attempt. Your coach
              will follow the details and adapt from there.
            </p>
          </div>
          <div className="upload-hero-action">
            <span className="action-index">01 / START HERE</span>
            <StartSessionButton />
            <p>Open a focused coaching thread for your next session.</p>
          </div>
        </section>

        <section className="upload-grid" aria-label="Start coaching">
          <div className="upload-primary-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">OR START WITH AN ATTEMPT</p>
                <h2>Send a video or wall photo.</h2>
              </div>
              <span className="panel-mark">02</span>
            </div>
            <p className="panel-copy">
              Upload the context your coach needs. Videos become attempts;
              photos stay in the thread to help read the problem.
            </p>
            <UploadForm />
          </div>

          <aside className="focus-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">CURRENT COACHING FOCUS</p>
                <h2>What we&apos;re tracking</h2>
              </div>
              <span className="live-dot" aria-hidden="true" />
            </div>
            {focusItems.length ? (
              <div className="focus-list">
                {focusItems.map(([label, value]) => (
                  <div className="focus-item" key={label}>
                    <span>{label}</span>
                    <p>{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">
                Your first session will establish a coaching focus here.
              </p>
            )}
          </aside>
        </section>

        <section className="history-section" aria-labelledby="history-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR COACHING LOG</p>
              <h2 id="history-title">Recent problems</h2>
            </div>
            <span>{recentSessions?.length ?? 0} sessions</span>
          </div>

          {recentSessions?.length ? (
            <div className="history-grid">
              {recentSessions.map((session) => {
                const attemptCount = session.uploads?.length ?? 0;
                return (
                  <Link
                    className="history-card"
                    href={`/session/${session.id}`}
                    key={session.id}
                  >
                    <div className="history-card-top">
                      <span>
                        {new Date(session.started_at).toLocaleDateString()}
                      </span>
                      <span className="history-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </div>
                    <h3>{session.session_summary || "Climbing session"}</h3>
                    <p className="history-meta">
                      {attemptCount}{" "}
                      {attemptCount === 1 ? "attempt" : "attempts"}
                    </p>
                    {session.next_session_focus && (
                      <p className="history-focus">
                        <strong>Next focus</strong> {session.next_session_focus}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="history-empty">
              <p>No climbing history yet.</p>
              <span>Your first session will appear here.</span>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
