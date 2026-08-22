"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import UploadForm from "@/app/upload/upload-form";

function buildAttempts(messages) {
  const attempts = [];
  let lastAttachmentType = null;

  messages.forEach((item) => {
    // Only videos represent climbing attempts. Images are route or wall context
    // and stay in the coaching thread below.
    if (item.attachment?.signedUrl) {
      lastAttachmentType = item.attachment.media_type;

      if (item.attachment.media_type === "video") {
        attempts.push({
          attempt: attempts.length + 1,
          media: item.attachment,
          note: item.message,
          coach: null,
        });
      }
    } else if (
      item.sender !== "user" &&
      attempts.length &&
      lastAttachmentType !== "image"
    ) {
      attempts[attempts.length - 1].coach = item;
    }
  });

  return attempts;
}

export default function ChatPanel({ coachingSessionId, userId, initialMessages = [], initialProgressState = null }) {
  const router = useRouter();
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [progressState, setProgressState] = useState(initialProgressState);
  const [finishing, setFinishing] = useState(false);
  const [savingFeedbackMessageId, setSavingFeedbackMessageId] = useState(null);
  const endRef = useRef(null);
  const uploadFormRef = useRef(null);

  async function saveMessage(message, sender) {
    if (!userId || !coachingSessionId) return null;
    const { data, error } = await createClient().from("chat_history").insert({ user_id: userId, coaching_session_id: coachingSessionId, message, sender }).select("id").single();
    if (error) { console.error("Error saving message:", error.message); return null; }
    return data.id;
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const onCoach = (event) => { const item = event.detail; if (item?.message) setMessages((current) => [...current, { id: item.id, message: item.message, sender: "ChatGPT", coachingHelpful: item.coachingHelpful ?? null }]); };
    const onAttachment = (event) => { const item = event.detail; if (item?.attachment?.signedUrl) setMessages((current) => [...current, { message: item.message, sender: "user", uploadId: item.uploadId, attachment: item.attachment }]); };
    const onProgress = (event) => { if (event.detail) setProgressState(event.detail); };
    window.addEventListener("climbing-coach-message", onCoach); window.addEventListener("climbing-user-attachment", onAttachment); window.addEventListener("climbing-progress-update", onProgress);
    return () => { window.removeEventListener("climbing-coach-message", onCoach); window.removeEventListener("climbing-user-attachment", onAttachment); window.removeEventListener("climbing-progress-update", onProgress); };
  }, []);

  async function processMessage(chatMessages, userText) {
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: coachingSessionId, message: userText }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "SUBSCRIPTION_REQUIRED" || data.code === "INSUFFICIENT_CREDITS") { posthog.capture("paywall_viewed", { source: "chat_coaching" }, { send_instantly: true }); router.push("/pricing?source=chat_coaching"); return; }
        throw new Error(data.error || "Chat request failed.");
      }
      const agentText = data.reply ?? "(No response from coach)";
      const id = await saveMessage(agentText, "ChatGPT");
      setMessages([...chatMessages, { id, message: agentText, sender: "ChatGPT", coachingHelpful: null }]);
      posthog.capture("text_coach_interaction", { session_id: coachingSessionId, coach_message_id: id }, { send_instantly: true });
    } catch (error) {
      console.error("Coach error:", error);
      const fallback = "Sorry—I'm having trouble reaching the AI coach right now. Please try again.";
      const id = await saveMessage(fallback, "ChatGPT");
      setMessages([...chatMessages, { id, message: fallback, sender: "ChatGPT", coachingHelpful: null }]);
    } finally { setTyping(false); }
  }

  async function saveCoachingFeedback(messageId, helpful) {
    if (!messageId || savingFeedbackMessageId === messageId) return;
    setSavingFeedbackMessageId(messageId);
    const { error } = await createClient().from("chat_history").update({ coaching_helpful: helpful, coaching_feedback_at: new Date().toISOString() }).eq("id", messageId).eq("user_id", userId);
    if (error) alert("Failed to save feedback.");
    else { setMessages((current) => current.map((item) => item.id === messageId ? { ...item, coachingHelpful: helpful } : item)); posthog.capture("coaching_feedback_given", { session_id: coachingSessionId, coach_message_id: messageId, helpful }, { send_instantly: true }); }
    setSavingFeedbackMessageId(null);
  }

  async function finishProblem() {
    if (finishing) return;
    setFinishing(true);
    try {
      const response = await fetch("/api/finish-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: coachingSessionId }) });
      const data = await response.json();
      if (!response.ok) { if (data.code === "SUBSCRIPTION_REQUIRED" || data.code === "INSUFFICIENT_CREDITS") { posthog.capture("paywall_viewed", { source: "finish_session" }, { send_instantly: true }); router.push("/pricing?source=finish_session"); return; } alert("Failed to finish this problem."); return; }
      router.push("/upload"); router.refresh();
    } catch { alert("Failed to finish this problem."); } finally { setFinishing(false); }
  }

  async function send() {
    if (typing) return;
    if (uploadFormRef.current?.hasFile) { await uploadFormRef.current.submitAttachment(); return; }
    const text = inputValue.trim(); if (!text) return;
    const next = [...messages, { message: text, sender: "user" }]; setMessages(next); setInputValue(""); setTyping(true); await saveMessage(text, "User"); await processMessage(next, text);
  }

  const attempts = buildAttempts(messages);
  const currentExperiment = progressState?.next_attempt_test || progressState?.current_experiment || "Upload your next attempt so your coach can find the next adjustment.";
  const latestCoach = attempts.at(-1)?.coach;

  return (
    <section className="coaching-grid">
      <div className="coaching-main">
        <div className="loop-label"><span className="live-dot" /> THE ADAPTIVE LOOP <span className="loop-line" /></div>
        <div className="next-card">
          <div className="next-card-top"><span className="next-kicker">TRY THIS NEXT</span><span className="next-arrow">↗</span></div>
          <h2>{currentExperiment}</h2>
          <p>{progressState?.active_limiter ? `Based on your current limiter: ${progressState.active_limiter}` : "One focused experiment at a time. Your next attempt gives the coach new information."}</p>
          <div className="next-action"><span>Retry the problem</span><span>↓</span></div>
        </div>

        {progressState?.progress_note && <div className="progress-note"><span className="check-mark">✓</span><div><strong>Coach&apos;s read</strong><p>{progressState.progress_note}</p></div></div>}

        <div className="attempts-heading"><h2>Your attempts</h2><span>{attempts.length ? `${attempts.length} ${attempts.length === 1 ? "attempt" : "attempts"}` : "Start your first attempt"}</span></div>
        <div className="attempts-list">
          {attempts.length === 0 && <div className="empty-attempt"><strong>Your first attempt starts the loop.</strong><span>Upload a clip below and your coach will call out one thing to try.</span></div>}
          {attempts.map((attempt, index) => (
            <article className="attempt-row" key={`${attempt.attempt}-${index}`}>
              <div className="attempt-marker"><span>{attempt.attempt}</span>{index < attempts.length - 1 && <i />}</div>
              <div className="attempt-card">
                <div className="attempt-heading"><div><span className="attempt-label">ATTEMPT {attempt.attempt}</span><span className="attempt-status">{index === attempts.length - 1 ? "Latest read" : "Reviewed"}</span></div></div>
                {attempt.media.media_type === "video" ? <video className="attempt-media" src={attempt.media.signedUrl} controls /> : <img className="attempt-media" src={attempt.media.signedUrl} alt={attempt.note || `Climbing attempt ${attempt.attempt}`} />}
                {attempt.note && attempt.note !== `Attempt ${attempt.attempt}` && <p className="attempt-caption">{attempt.note}</p>}
                <div className="insight-grid">
                  <div><span className="insight-label">COACH NOTICED</span><p>{attempt.coach?.message || "Your coach is reviewing this attempt..."}</p></div>
                  <div><span className="insight-label">WHAT CHANGED</span><p>{index ? "Compare this movement with your previous attempt." : "Baseline captured. Your next try gives us a comparison."}</p></div>
                </div>
                {attempt.coach && <div className="coach-feedback"><div><span className="insight-label">NEXT EXPERIMENT</span><strong>{index === attempts.length - 1 ? currentExperiment : "Keep the adjustment and notice what feels different."}</strong></div><div className="feedback-buttons"><button type="button" onClick={() => saveCoachingFeedback(attempt.coach.id, true)} disabled={savingFeedbackMessageId === attempt.coach.id}>{attempt.coach.coachingHelpful === true ? "Helpful ✓" : "Helpful"}</button><button type="button" onClick={() => saveCoachingFeedback(attempt.coach.id, false)} disabled={savingFeedbackMessageId === attempt.coach.id}>{attempt.coach.coachingHelpful === false ? "Not quite" : "Feedback"}</button></div></div>}
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="coach-sidebar">
        <div className="sidebar-heading"><div><span className="eyebrow">COACHING THREAD</span><h2>Talk it through</h2></div><span className="coach-pulse" /></div>
        <p className="sidebar-copy">Ask a question between attempts. Keep the loop moving.</p>
        <div className="thread-messages">{messages.map((item, index) => <div className={`thread-message ${item.sender === "user" ? "is-user" : "is-coach"}`} key={item.id ?? index}><span>{item.sender === "user" ? "YOU" : "COACH"}</span>{item.message && <p>{item.message}</p>}{item.attachment?.signedUrl && item.attachment.media_type === "image" && <img className="thread-attachment" src={item.attachment.signedUrl} alt={item.message || "Route or wall context"} />}{item.attachment?.signedUrl && item.attachment.media_type === "video" && <video className="thread-attachment" src={item.attachment.signedUrl} controls aria-label="Climbing attempt video" />}</div>)}{typing && <div className="typing">Coach is thinking<span>...</span></div>}<div ref={endRef} /></div>
        <div className="composer"><UploadForm ref={uploadFormRef} initialCoachingSessionId={coachingSessionId} composerMode messageText={inputValue} onAttachmentSent={() => setInputValue("")} /><input value={inputValue} onChange={(event) => setInputValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) send(); }} placeholder="Ask your coach..." aria-label="Ask your coach" /><button type="button" onClick={send} aria-label="Send message">Send</button></div>
        <button className="finish-button" type="button" onClick={finishProblem} disabled={finishing}>{finishing ? "Finishing..." : "Finish problem"}<span>→</span></button>
      </aside>
    </section>
  );
}
