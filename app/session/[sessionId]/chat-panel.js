"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import UploadForm from "@/app/upload/upload-form";

export default function ChatPanel({
  coachingSessionId,
  userId,
  initialMessages = [],
}) {
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");

  const endRef = useRef(null);

  async function saveMessage(message, sender) {
    if (!userId || !coachingSessionId) {
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.from("chat_history").insert({
      user_id: userId,
      coaching_session_id: coachingSessionId,
      message,
      sender,
    });

    if (error) {
      console.error("Error saving message:", error.message);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleCoachMessage(event) {
      const message = event.detail?.message;

      if (!message) {
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          message,
          sender: "ChatGPT",
        },
      ]);
    }

    window.addEventListener("climbing-coach-message", handleCoachMessage);

    return () => {
      window.removeEventListener("climbing-coach-message", handleCoachMessage);
    };
  }, []);

  useEffect(() => {
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

    window.addEventListener("climbing-user-attachment", handleUserAttachment);

    return () => {
      window.removeEventListener(
        "climbing-user-attachment",
        handleUserAttachment,
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
      const agentText = data.reply ?? "(No response from coach)";

      setMessages([...chatMessages, { message: agentText, sender: "ChatGPT" }]);

      await saveMessage(agentText, "ChatGPT");
    } catch (error) {
      console.error("Coach error:", error);

      const fallback =
        "Sorry—I'm having trouble reaching the AI coach right now. Please try again.";

      setMessages([...chatMessages, { message: fallback, sender: "ChatGPT" }]);

      await saveMessage(fallback, "ChatGPT");
    } finally {
      setTyping(false);
    }
  }

  async function send() {
    const text = inputValue.trim();

    if (!text || typing) {
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
      <h2>Ask your coach</h2>

      <div>
        {messages.map((item, index) => (
          <div key={index}>
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
        <UploadForm initialCoachingSessionId={coachingSessionId} composerMode />

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
    </div>
  );
}
