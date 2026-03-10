"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const { data: session } = useSession();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const user = session?.user as { id: string; name?: string } | undefined;

  // 1. Fetch messages
  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch("/api/chat/messages");
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMessages();
  }, []);

  // 2. Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });

      if (res.ok) {
        const newMessage = await res.json();
        setMessages((prev) => [...prev, newMessage]);
        setMessage("");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl h-[calc(100vh-120px)] flex flex-col">
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
        {/* Header */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            T
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Academy Support / Teacher</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Online</div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-opacity-5" style={{ background: "var(--bg-secondary)" }}>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg) => {
              const isMine = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm"
                    style={{
                      background: isMine ? "var(--accent)" : "#fff",
                      color: isMine ? "#fff" : "var(--text-primary)",
                      borderBottomRightRadius: isMine ? 4 : undefined,
                      borderBottomLeftRadius: !isMine ? 4 : undefined,
                    }}
                  >
                    {!isMine && (
                      <div className="text-[10px] font-bold mb-1 opacity-70 uppercase tracking-tighter">
                        {msg.senderName}
                      </div>
                    )}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    <div
                      className="text-[9px] mt-1 text-right"
                      style={{ opacity: 0.6 }}
                    >
                      {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10">
              <p className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>No messages yet. Say Assalamu Alaikum!</p>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-accent focus:ring-opacity-20"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
