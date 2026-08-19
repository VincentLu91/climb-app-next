"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";

import { createClient } from "@/lib/supabase/client";
import UploadForm from "@/app/upload/upload-form";

export default function ChatPanel({
  coachingSessionId,
  userId,
  initialMessages = [],
  initialProgressState = null,
}) {
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
    if (!userId || !coachingSessionId) {
      return null;
    }

    const supabase = createClient();

    const { data, error } = await supabase
      .from("chat_history")
      .insert({
        user_id: userId,
        coaching_session_id: coachingSessionId,
        message,
        sender,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error saving message:", error.message);
      return null;
    }

    return data.id;
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleCoachMessage(event) {
      const coachMessage = event.detail;

      if (!coachMessage?.message) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: coachMessage.id,
          message: coachMessage.message,
          sender: "ChatGPT",
          coachingHelpful: coachMessage.coachingHelpful ?? null,
        },
      ]);
    }

    function handleUserAttachment(event) {
      const attachmentMessage = event.detail;

      if (!attachmentMessage?.attachment?.signedUrl) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          message: attachmentMessage.message,
          sender: "user",
          uploadId: attachmentMessage.uploadId,
          attachment: attachmentMessage.attachment,
        },
      ]);
    }

    function handleProgressUpdate(event) {
      const updatedState = event.detail;

      if (!updatedState) {
        return;
      }

      setProgressState(updatedState);
    }

    window.addEventListener("climbing-coach-message", handleCoachMessage);
    window.addEventListener("climbing-user-attachment", handleUserAttachment);
    window.addEventListener("climbing-progress-update", handleProgressUpdate);

    return () => {
      window.removeEventListener("climbing-coach-message", handleCoachMessage);
      window.removeEventListener(
        "climbing-user-attachment",
        handleUserAttachment,
      );
      window.removeEventListener(
        "climbing-progress-update",
        handleProgressUpdate,
      );
    };
  }, []);

  async function processMessageToChatGPT(chatMessages, userText) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: coachingSessionId,
          message: userText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === "SUBSCRIPTION_REQUIRED") {
          posthog.capture(
            "paywall_viewed",
            {
              source: "chat_coaching",
            },
            {
              send_instantly: true,
            },
          );

          const checkoutResponse = await fetch("/api/checkout", {
            method: "POST",
          });

          const checkoutData = await checkoutResponse.json();

          if (checkoutResponse.ok && checkoutData.url) {
            posthog.capture(
              "checkout_started",
              {
                source: "chat_coaching",
              },
              {
                send_instantly: true,
              },
            );

            window.location.href = checkoutData.url;
            return;
          }

          alert("Unable to start checkout.");
          return;
        }

        throw new Error(data.error || "Chat request failed.");
      }

      const agentText = data.reply ?? "(No response from coach)";
      const coachMessageId = await saveMessage(agentText, "ChatGPT");

      setMessages([
        ...chatMessages,
        {
          id: coachMessageId,
          message: agentText,
          sender: "ChatGPT",
          coachingHelpful: null,
        },
      ]);

      posthog.capture(
        "text_coach_interaction",
        {
          session_id: coachingSessionId,
          coach_message_id: coachMessageId,
        },
        {
          send_instantly: true,
        },
      );
    } catch (error) {
      console.error("Coach error:", error);

      const fallback =
        "Sorry—I'm having trouble reaching the AI coach right now. Please try again.";

      const coachMessageId = await saveMessage(fallback, "ChatGPT");

      setMessages([
        ...chatMessages,
        {
          id: coachMessageId,
          message: fallback,
          sender: "ChatGPT",
          coachingHelpful: null,
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  async function saveCoachingFeedback(messageId, helpful) {
    if (!messageId || savingFeedbackMessageId === messageId) {
      return;
    }

    setSavingFeedbackMessageId(messageId);

    const supabase = createClient();

    const { error } = await supabase
      .from("chat_history")
      .update({
        coaching_helpful: helpful,
        coaching_feedback_at: new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to save coaching feedback:", error);
      alert("Failed to save feedback.");
    } else {
      setMessages((currentMessages) =>
        currentMessages.map((item) =>
          item.id === messageId
            ? {
                ...item,
                coachingHelpful: helpful,
              }
            : item,
        ),
      );

      posthog.capture(
        "coaching_feedback_given",
        {
          session_id: coachingSessionId,
          coach_message_id: messageId,
          helpful,
        },
        {
          send_instantly: true,
        },
      );
    }

    setSavingFeedbackMessageId(null);
  }

  async function finishProblem() {
    if (finishing) {
      return;
    }

    setFinishing(true);

    try {
      const response = await fetch("/api/finish-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: coachingSessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Finish session error:", data);

        if (
          data.code === "SUBSCRIPTION_REQUIRED" ||
          data.code === "INSUFFICIENT_CREDITS"
        ) {
          posthog.capture(
            "paywall_viewed",
            {
              source: "finish_session",
            },
            {
              send_instantly: true,
            },
          );

          const checkoutResponse = await fetch("/api/checkout", {
            method: "POST",
          });

          const checkoutData = await checkoutResponse.json();

          if (checkoutResponse.ok && checkoutData.url) {
            posthog.capture(
              "checkout_started",
              {
                source: "finish_session",
              },
              {
                send_instantly: true,
              },
            );

            window.location.href = checkoutData.url;
            return;
          }

          alert("Unable to start checkout.");
          return;
        }

        alert("Failed to finish this problem.");
        return;
      }

      router.push("/upload");
      router.refresh();
    } catch (error) {
      console.error("Finish session error:", error);
      alert("Failed to finish this problem.");
    } finally {
      setFinishing(false);
    }
  }

  async function send() {
    if (typing) {
      return;
    }

    if (uploadFormRef.current?.hasFile) {
      await uploadFormRef.current.submitAttachment();
      return;
    }

    const text = inputValue.trim();

    if (!text) {
      return;
    }

    const next = [...messages, { message: text, sender: "user" }];

    setMessages(next);
    setInputValue("");
    setTyping(true);

    await saveMessage(text, "User");
    await processMessageToChatGPT(next, text);
  }

  return (
    <div>
      {progressState && (
        <div>
          <h2>Current Focus</h2>

          <p>
            <strong>Active limiter:</strong>{" "}
            {progressState.active_limiter || "Not identified yet"}
          </p>

          <p>
            <strong>Progress:</strong>{" "}
            {progressState.progress_note || "No progress recorded yet"}
          </p>

          <p>
            <strong>What we&apos;re testing:</strong>{" "}
            {progressState.current_experiment || "No active experiment yet"}
          </p>

          <p>
            <strong>Next attempt should test:</strong>{" "}
            {progressState.next_attempt_test || "No test defined yet"}
          </p>
        </div>
      )}

      <h2>Ask your coach</h2>

      <div>
        {messages.map((item, index) => (
          <div key={item.id ?? index}>
            <strong>{item.sender === "user" ? "You" : "Coach"}:</strong>

            {item.attachment?.signedUrl && (
              <div>
                {item.attachment.media_type === "video" ? (
                  <video src={item.attachment.signedUrl} controls width="320" />
                ) : (
                  <img
                    src={item.attachment.signedUrl}
                    alt={item.message}
                    width="320"
                  />
                )}
              </div>
            )}

            <span>{item.message}</span>

            {item.sender !== "user" && item.id && (
              <div>
                <span>Helpful? </span>

                <button
                  type="button"
                  onClick={() => saveCoachingFeedback(item.id, true)}
                  disabled={savingFeedbackMessageId === item.id}
                >
                  {item.coachingHelpful === true ? "Yes (selected)" : "Yes"}
                </button>

                <button
                  type="button"
                  onClick={() => saveCoachingFeedback(item.id, false)}
                  disabled={savingFeedbackMessageId === item.id}
                >
                  {item.coachingHelpful === false ? "No (selected)" : "No"}
                </button>
              </div>
            )}
          </div>
        ))}

        {typing && <div>Coach is typing...</div>}

        <div ref={endRef} />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <UploadForm
          ref={uploadFormRef}
          initialCoachingSessionId={coachingSessionId}
          composerMode
          messageText={inputValue}
          onAttachmentSent={() => setInputValue("")}
        />

        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              send();
            }
          }}
          placeholder="Ask your coach..."
          style={{ flex: 1 }}
        />

        <button type="button" onClick={send}>
          Send
        </button>
      </div>

      <button type="button" onClick={finishProblem} disabled={finishing}>
        {finishing ? "Finishing..." : "Finish problem"}
      </button>
    </div>
  );
}
