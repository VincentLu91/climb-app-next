"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    async function checkExistingUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/");
        return;
      }

      setCheckingAuth(false);
    }

    checkExistingUser();
  }, [router]);

  async function handleLogin(event) {
    event.preventDefault();

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleSignUp() {
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Check your email to confirm your account.");
  }

  if (checkingAuth) {
    return null;
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link className="wordmark" href="/" aria-label="CLIMB/COACH home">
          CLIMB<span>/</span>COACH
        </Link>
        <span className="auth-header-note">ADAPTIVE CLIMBING COACHING</span>
      </header>

      <section className="auth-layout" aria-labelledby="login-title">
        <div className="auth-intro">
          <p className="eyebrow">YOUR NEXT MOVE STARTS HERE</p>
          <h1 id="login-title">
            Keep climbing.
            <br />
            <em>Keep adapting.</em>
          </h1>
          <p className="auth-lede">
            Return to your coaching loop and pick up where your last attempt
            left off.
          </p>
          <div className="auth-loop" aria-label="Adaptive coaching loop">
            <span>ATTEMPT</span>
            <i /> <span>NOTICE</span>
            <i /> <span>ADAPT</span>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">WELCOME BACK</p>
            <span className="auth-status">01 / 01</span>
          </div>
          <h2>Log in to your coach</h2>
          <p className="auth-panel-copy">
            Your sessions, progress, and next experiment are waiting.
          </p>

          <form className="auth-form" onSubmit={handleLogin}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />

            <button className="auth-primary" type="submit">
              <span>Log in</span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              className="auth-signup"
              type="button"
              onClick={handleSignUp}
            >
              New to CLIMB/COACH? <strong>Sign up</strong>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
