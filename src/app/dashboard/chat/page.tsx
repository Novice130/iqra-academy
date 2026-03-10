"use client";

/**
 * Chat / Messages Page — Parent-teacher messaging
 */

import { useState } from "react";

const DEMO_MESSAGES = [
  { id: 1, from: "teacher", name: "Ustadh Ali", text: "Assalamu Alaikum! Aisha did very well today. She has mastered the heavy letters (ق, ط, ظ). Please practice page 14 at home.", time: "Mar 8, 4:35 PM" },
  { id: 2, from: "parent", name: "You", text: "Wa Alaikum Assalam! JazakAllahu Khairan for the update. We will practice tonight InshaAllah.", time: "Mar 8, 5:12 PM" },
  { id: 3, from: "teacher", name: "Ustadh Ali", text: "Alhamdulillah! Also I wanted to let you know that Yusuf's Tajweed is improving a lot. He correctly applied Ikhfa rules today without any prompting.", time: "Mar 9, 10:45 AM" },
  { id: 4, from: "parent", name: "You", text: "MashaAllah that's wonderful to hear! He's been practicing on his own after school.", time: "Mar 9, 11:02 AM" },
  { id: 5, from: "teacher", name: "Ustadh Ali", text: "That dedication shows! Keep it up. For next week, I'd like to start both students on a new chapter. I've attached the pages to review.", time: "Mar 9, 11:10 AM" },
];

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(DEMO_MESSAGES);

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        from: "parent",
        name: "You",
        text: message,
        time: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      },
    ]);
    setMessage("");
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Messages
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Chat with your teacher
        </p>
      </div>

      {/* Chat thread */}
      <div className="card flex-1 flex flex-col overflow-hidden">
        {/* Teacher header */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            A
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Ustadh Ali Rahman</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Qaidah & Quran Reading Teacher</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.from === "parent" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] rounded-2xl px-4 py-2.5"
                style={{
                  background: msg.from === "parent" ? "var(--accent)" : "var(--bg-secondary)",
                  color: msg.from === "parent" ? "#fff" : "var(--text-primary)",
                  borderBottomRightRadius: msg.from === "parent" ? 4 : undefined,
                  borderBottomLeftRadius: msg.from === "teacher" ? 4 : undefined,
                }}
              >
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <div
                  className="text-[10px] mt-1 text-right"
                  style={{ opacity: 0.6 }}
                >
                  {msg.time}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
