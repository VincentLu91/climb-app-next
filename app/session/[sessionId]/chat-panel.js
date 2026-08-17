"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
            <strong>{item.sender === "user" ? "You" : "Coach"}:</strong>{" "}
            {item.message}
          </div>
        ))}

        {typing && <div>Coach is typing...</div>}

        <div ref={endRef} />
      </div>

      <input
        type="text"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            send();
          }
        }}
        placeholder="Ask about this climbing session..."
      />

      <button type="button" onClick={send}>
        Send
      </button>
    </div>
  );
}
