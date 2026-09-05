"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { format } from "date-fns";

interface Message {
  id: string;
  senderId: string;
  sender: { id: string; name: string; role: string } | null;
  content: string;
  createdAt: string;
}

function extractYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function extractVimeoId(url: string): string | null {
  const regExp = /(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:[a-zA-Z0-9_\-]+)?/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

export default function ChatPage() {
  const { data: session } = authClient.useSession();
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId");
  const studentName = searchParams.get("studentName");

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const user = session?.user as { id: string; name?: string } | undefined;

  // 1. Fetch messages
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const url = studentId
        ? `/api/chat/messages?studentId=${encodeURIComponent(studentId)}`
        : "/api/chat/messages";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError({
          message: errData.error || "Failed to load messages.",
          retry: () => fetchMessages(),
        });
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      setError({
        message: "Failed to load messages. Check your connection.",
        retry: () => fetchMessages(),
      });
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 2. Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress & scale to max 1200px
        const maxDimension = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setAttachedImage(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSend = async () => {
    if ((!message.trim() && !attachedImage) || sending) return;

    setSending(true);
    setError(null);
    let payloadContent = message.trim();
    if (attachedImage) {
      payloadContent = payloadContent
        ? `${payloadContent}\n\n![attachment](${attachedImage})`
        : `![attachment](${attachedImage})`;
    }

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payloadContent, ...(studentId ? { studentId } : {}) }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setMessage("");
        setAttachedImage(null);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError({
          message: errData.error || "Failed to send message.",
          retry: () => handleSend(),
        });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setError({
        message: "Failed to send message. Check your connection.",
        retry: () => handleSend(),
      });
    } finally {
      setSending(false);
    }
  };

  const headerName = studentName || "Academy Support / Teacher";
  const headerInitial = (studentName || "T")[0].toUpperCase();

  const renderMessageContent = (content: string) => {
    // Check for markdown image format: ![...](url)
    const imgRegex = /!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = imgRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push(renderTextWithMediaLinks(textBefore, `text-${lastIndex}`));
      }
      const imgUrl = match[1];
      parts.push(
        <div key={`img-${match.index}`} className="my-2 max-w-sm rounded-xl overflow-hidden cursor-pointer shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt="Attachment"
            className="w-full h-auto max-h-64 object-cover rounded-xl hover:opacity-95 transition"
            onClick={() => setPreviewModalImg(imgUrl)}
          />
        </div>
      );
      lastIndex = match.index + match[0].length;
    }

    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push(renderTextWithMediaLinks(remainingText, `text-${lastIndex}`));
    }

    return parts.length > 0 ? parts : renderTextWithMediaLinks(content, "plain");
  };

  const renderTextWithMediaLinks = (text: string, keyPrefix: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const words = line.split(" ");
      const elements = words.map((word, wIdx) => {
        if (word.startsWith("http://") || word.startsWith("https://")) {
          const ytId = extractYouTubeId(word);
          if (ytId) {
            return (
              <span key={`${keyPrefix}-${idx}-${wIdx}`} className="block my-2">
                <iframe
                  className="w-full max-w-sm aspect-video rounded-xl shadow-md"
                  src={`https://www.youtube.com/embed/${ytId}`}
                  title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </span>
            );
          }
          const vimeoId = extractVimeoId(word);
          if (vimeoId) {
            return (
              <span key={`${keyPrefix}-${idx}-${wIdx}`} className="block my-2">
                <iframe
                  className="w-full max-w-sm aspect-video rounded-xl shadow-md"
                  src={`https://player.vimeo.com/video/${vimeoId}`}
                  title="Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </span>
            );
          }
          if (word.match(/\.(mp4|webm|mov)(\?.*)?$/i)) {
            return (
              <span key={`${keyPrefix}-${idx}-${wIdx}`} className="block my-2">
                <video
                  controls
                  src={word}
                  className="w-full max-w-sm aspect-video rounded-xl shadow-md"
                />
              </span>
            );
          }
          return (
            <a
              key={`${keyPrefix}-${idx}-${wIdx}`}
              href={word}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold hover:opacity-80 break-all"
            >
              {word}{" "}
            </a>
          );
        }
        return word + " ";
      });

      return (
        <span key={`${keyPrefix}-line-${idx}`} className="block leading-relaxed">
          {elements}
        </span>
      );
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl h-[calc(100vh-100px)] flex flex-col mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Messages
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {studentId ? "Support thread" : "Chat with your teacher"} · 2-month history
          </p>
        </div>
      </div>

      {/* Chat thread card */}
      <div className="card flex-1 flex flex-col overflow-hidden rounded-3xl border border-white/10 shadow-xl bg-neutral-900/60 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md"
            style={{ background: "linear-gradient(135deg, #007aff 0%, #0056b3 100%)" }}
          >
            {headerInitial}
          </div>
          <div>
            <div className="text-sm font-bold text-white">{headerName}</div>
            <div className="text-xs text-neutral-400 font-medium">
              Direct Conversation
            </div>
          </div>
        </div>

        {/* Inline Error Banner */}
        {error && (
          <div
            role="alert"
            className="mx-4 my-2 p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fadeIn"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>{error.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {error.retry && (
                <button
                  type="button"
                  onClick={error.retry}
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-red-500/25 hover:bg-red-500/40 text-white transition cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="text-red-300 hover:text-white transition px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Messages list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{ background: "rgba(15, 17, 23, 0.6)" }}
        >
          {loading ? (
            <div className="space-y-4 py-4 animate-pulse">
              <div className="flex justify-start">
                <div className="w-48 h-12 rounded-3xl bg-white/10" />
              </div>
              <div className="flex justify-end">
                <div className="w-64 h-16 rounded-3xl bg-blue-500/20" />
              </div>
              <div className="flex justify-start">
                <div className="w-56 h-12 rounded-3xl bg-white/10" />
              </div>
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg) => {
              const isMine = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] sm:max-w-[75%] rounded-3xl px-4 py-3 shadow-md"
                    style={{
                      background: isMine
                        ? "linear-gradient(135deg, #007aff 0%, #0056b3 100%)"
                        : "rgba(30, 33, 42, 0.9)",
                      color: "#fff",
                      border: isMine ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderBottomRightRadius: isMine ? 6 : undefined,
                      borderBottomLeftRadius: !isMine ? 6 : undefined,
                    }}
                  >
                    {!isMine && (
                      <div className="text-[11px] font-bold mb-1 text-blue-400 uppercase tracking-tight">
                        {msg.sender?.name || "Teacher / Academy"}
                      </div>
                    )}
                    <div className="text-sm leading-relaxed">{renderMessageContent(msg.content)}</div>
                    <div className="text-[10px] mt-1.5 text-right opacity-60">
                      {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16">
              <p className="text-sm text-neutral-400">No messages yet. Say Assalamu Alaikum!</p>
            </div>
          )}
        </div>

        {/* Attached image preview banner */}
        {attachedImage && (
          <div className="px-4 py-2 bg-neutral-800/90 border-t border-white/10 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachedImage} alt="Attached" className="w-12 h-12 rounded-xl object-cover border border-white/20" />
            <span className="text-xs text-neutral-300 font-medium">Image attached</span>
            <button
              onClick={() => setAttachedImage(null)}
              className="ml-auto text-xs text-red-400 hover:text-red-300 font-bold px-2 py-1 bg-white/10 rounded-lg"
            >
              Remove
            </button>
          </div>
        )}

        {/* Hidden file & camera inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Input Bar */}
        <div className="p-3 sm:p-4 flex items-center gap-2 border-t border-white/10 bg-neutral-900/80">
          <button
            type="button"
            title="Attach image"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 text-neutral-300 hover:text-white transition cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>

          <button
            type="button"
            title="Take a photo"
            onClick={() => cameraInputRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 text-neutral-300 hover:text-white transition cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message or paste a video link..."
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-2xl text-sm outline-none transition-all bg-white/10 text-white placeholder-neutral-400 border border-white/10 focus:border-blue-500 focus:bg-white/15"
          />

          <button
            onClick={handleSend}
            disabled={(!message.trim() && !attachedImage) || sending}
            className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-lg"
            style={{ background: "linear-gradient(135deg, #007aff 0%, #0056b3 100%)" }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </div>

      {/* Lightbox Image Preview Modal */}
      {previewModalImg && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewModalImg(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewModalImg} alt="Preview" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
            <button
              onClick={() => setPreviewModalImg(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center font-bold hover:bg-black/80 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
