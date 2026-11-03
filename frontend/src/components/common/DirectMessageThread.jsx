import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Paperclip, X, ShieldCheck, Trash2, Check, CheckCheck, Smile, Mic, Bot } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { listMessages, postMessage, dmGroup, deleteMessage, markMessageRead } from "../../api/messages";
import { ROLE_META } from "../../data/mockData";
import { renderAssistantText } from "../../lib/richText";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const POLL_MS = 3000;

/* ─── helpers ──────────────────────────────────────────────────────────── */
function fmt(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function dateSep(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "2-digit", month: "long" });
}

function renderText(text) {
  const parts = text.split(/(@[\w.]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} style={{ color: "var(--accent-blue)", fontWeight: 600 }}>{part}</span>
    ) : <span key={i}>{part}</span>
  );
}

/* ─── Tick receipt icon ─────────────────────────────────────────────────── */
function Ticks({ readCount, mine }) {
  if (!mine) return null;
  if (readCount > 0)
    return <CheckCheck size={13} style={{ color: "var(--accent-emerald)", flexShrink: 0 }} />;
  return <Check size={13} style={{ opacity: 0.6, flexShrink: 0 }} />;
}

/* ─── Delete context menu ────────────────────────────────────────────────── */
function DeleteMenu({ mine, onDeleteMe, onDeleteEveryone, onClose }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        zIndex: 120,
        background: "var(--glass-bg, rgba(18,22,36,0.95))",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--glass-border)",
        borderRadius: 12,
        padding: "6px 4px",
        minWidth: 180,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        marginTop: 6,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onDeleteMe}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "9px 14px", background: "none", border: "none",
          color: "var(--accent-rose, #f43f5e)", cursor: "pointer", fontSize: 13,
          borderRadius: 8, textAlign: "left",
        }}
      >
        <Trash2 size={14} /> Delete for me
      </button>
      {mine && (
        <button
          onClick={onDeleteEveryone}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "9px 14px", background: "none", border: "none",
            color: "var(--accent-rose, #f43f5e)", cursor: "pointer", fontSize: 13,
            borderRadius: 8, textAlign: "left",
          }}
        >
          <Trash2 size={14} /> Delete for everyone
        </button>
      )}
      <button
        onClick={onClose}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "9px 14px", background: "none", border: "none",
          color: "var(--text-lo)", cursor: "pointer", fontSize: 13,
          borderRadius: 8, textAlign: "left",
        }}
      >
        <X size={14} /> Cancel
      </button>
    </div>
  );
}

/* ─── Single message bubble ─────────────────────────────────────────────── */
function MessageBubble({ m, mine, prevDate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  const curDate = dateSep(m.created_at);
  const showDate = curDate !== prevDate;
  const deleted = m.deleted_for_everyone;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      {showDate && (
        <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 6px" }}>
          <span style={{
            fontSize: 11, color: "var(--text-faint)", background: "rgba(255,255,255,0.06)",
            padding: "3px 12px", borderRadius: 99, border: "1px solid var(--glass-border)",
          }}>
            {curDate}
          </span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: mine ? "flex-end" : "flex-start",
          padding: "1px 4px",
        }}
      >
        <div
          ref={wrapRef}
          style={{ position: "relative", maxWidth: "75%" }}
          onMouseLeave={() => setMenuOpen(false)}
        >
          {/* Hover delete button */}
          {!deleted && (
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Message options"
              style={{
                position: "absolute",
                top: 6,
                [mine ? "left" : "right"]: -30,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--glass-border)",
                borderRadius: "50%",
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-faint)",
                opacity: 0,
                transition: "opacity 0.15s",
                pointerEvents: "none",
              }}
              className="msg-opts-btn"
            >
              <Trash2 size={12} />
            </button>
          )}

          {/* Bubble */}
          <div
            style={{
              padding: deleted ? "8px 14px" : "9px 13px 7px",
              borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: mine
                ? "linear-gradient(135deg, var(--accent-blue), #5a3fcf)"
                : "rgba(255,255,255,0.07)",
              color: mine ? "#fff" : "var(--text-hi)",
              boxShadow: mine
                ? "0 2px 14px rgba(59,108,246,0.25)"
                : "0 2px 8px rgba(0,0,0,0.18)",
              border: mine ? "none" : "1px solid var(--glass-border)",
              cursor: deleted ? "default" : "pointer",
              userSelect: "text",
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!deleted) setMenuOpen((o) => !o);
            }}
            onDoubleClick={() => { if (!deleted) setMenuOpen((o) => !o); }}
          >
            {deleted ? (
              <span style={{ fontSize: 12.5, fontStyle: "italic", opacity: 0.5 }}>
                🚫 This message was deleted
              </span>
            ) : (
              <>
                {m.attachment?.type === "image" && (
                  <img
                    src={m.attachment.data}
                    alt={m.attachment.name || "attachment"}
                    style={{ maxWidth: "100%", borderRadius: 12, marginBottom: m.text ? 6 : 4, display: "block" }}
                  />
                )}
                {m.text && (
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                    {m.from_user_id === "agent" ? renderAssistantText(m.text) : renderText(m.text)}
                  </div>
                )}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-end",
                  gap: 4, marginTop: 5,
                }}>
                  <span style={{ fontSize: 10, opacity: 0.55, fontFamily: "var(--font-mono)" }}>
                    {fmt(m.created_at)}
                  </span>
                  <Ticks readCount={m.read_count} mine={mine} />
                </div>
              </>
            )}
          </div>

          {/* Context menu */}
          {menuOpen && !deleted && (
            <DeleteMenu
              mine={mine}
              onDeleteMe={() => { onDelete(m.id, "me"); setMenuOpen(false); }}
              onDeleteEveryone={() => { onDelete(m.id, "everyone"); setMenuOpen(false); }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Main DM thread ─────────────────────────────────────────────────────── */
export default function DirectMessageThread({ otherUser, onFirstMessageSent }) {
  const { user } = useAuth();
  const safeName = otherUser?.name || "Unknown user";
  const firstName = safeName.split(" ")[0];
  const group = dmGroup(user.id, otherUser?.id);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textRef = useRef(null);

  const fetchMessages = useCallback(() => {
    listMessages(group)
      .then((data) => setMessages(data.slice().reverse()))
      .catch((err) => setError(err.message || "Failed to load messages."));
  }, [group]);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    const safe = () => { if (!cancelled) fetchMessages(); };
    safe();
    const id = setInterval(safe, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages?.length]);

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Only image files can be attached."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError("Image too large — use one under 3MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setImage({ data: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  const send = async () => {
    if ((!text.trim() && !image) || sending) return;
    setSending(true);
    setError(null);
    const wasFirst = messages !== null && messages.length === 0;
    try {
      const sent = await postMessage({
        group,
        text: text.trim() || (image ? "(sent an image)" : ""),
        attachment: image ? { type: "image", data: image.data, name: image.name } : null,
      });
      setMessages((m) => [...(m || []), sent]);
      setText("");
      setImage(null);
      textRef.current?.focus();
      if (wasFirst) onFirstMessageSent?.();
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const onDelete = async (id, scope) => {
    // Optimistic update
    setMessages((prev) => prev.map((m) =>
      m.id === id
        ? scope === "everyone"
          ? { ...m, deleted_for_everyone: true, text: "", attachment: null }
          : null
        : m
    ).filter(Boolean));
    try {
      await deleteMessage(id, scope);
    } catch {
      fetchMessages(); // revert on error
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const roleMeta = otherUser.role ? ROLE_META[otherUser.role] : null;
  const isOnline = false; // placeholder — no presence endpoint yet

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 460 }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "0 2px 14px", borderBottom: "1px solid var(--glass-border)", marginBottom: 0,
      }}>
        <div style={{ position: "relative" }}>
          {otherUser.role === "agent" || otherUser.id === "agent" ? (
            <div className="avatar" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", width: 40, height: 40, display: "grid", placeItems: "center" }}>
              <Bot size={20} color="#fff" />
            </div>
          ) : (
            <div className="avatar" style={{ background: "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))", width: 40, height: 40, fontSize: 16 }}>
              {safeName[0]?.toUpperCase()}
            </div>
          )}
          {(isOnline || otherUser.role === "agent") && (
            <span style={{
              position: "absolute", bottom: 0, right: 0,
              width: 11, height: 11, borderRadius: "50%",
              background: "var(--accent-emerald)", border: "2px solid var(--bg-base)",
              boxShadow: "0 0 6px var(--accent-emerald)",
            }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.2 }}>{safeName}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
            {otherUser.role === "agent" || otherUser.id === "agent"
              ? "CampusFlow Institutional AI Agent · Live LLM Grounded"
              : otherUser.email || (roleMeta ? roleMeta.label : "Private conversation")}
          </div>
        </div>
        {(roleMeta || otherUser.role === "agent") && (
          <span
            className="pill"
            style={{
              color: otherUser.role === "agent" ? "var(--accent-violet)" : roleMeta.color,
              borderColor: otherUser.role === "agent" ? "rgba(139, 92, 246, 0.4)" : `${roleMeta.color}40`,
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            {otherUser.role === "agent" ? "AI Agent" : roleMeta.label}
          </span>
        )}
      </div>

      {/* ── Message list ── */}
      <div style={{
        flex: 1, overflowY: "auto", display: "flex", flexDirection: "column",
        padding: "12px 4px 6px",
        /* enable hover-reveal of delete btn via CSS trick */
      }}>
        <style>{`
          .msg-opts-btn { opacity: 0 !important; pointer-events: none !important; }
          [style*="position: relative"]:hover .msg-opts-btn {
            opacity: 1 !important; pointer-events: auto !important;
          }
        `}</style>

        {messages === null && (
          <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", marginTop: 32 }}>Loading conversation…</p>
        )}
        {messages?.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))", display: "grid", placeItems: "center", fontSize: 24 }}>
              {safeName[0]?.toUpperCase()}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-lo)", margin: 0, fontWeight: 500 }}>{safeName}</p>
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: 0 }}>
              No messages yet — say hello to {firstName}!
            </p>
          </div>
        )}
        {messages?.map((m, i) => {
          const prevDate = i > 0 ? dateSep(messages[i - 1].created_at) : null;
          return (
            <MessageBubble
              key={m.id}
              m={m}
              mine={m.from_user_id === user.id}
              prevDate={prevDate}
              onDelete={onDelete}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          fontSize: 11.5, color: "var(--accent-rose, #f43f5e)",
          background: "rgba(244,63,94,0.08)", borderRadius: 8, padding: "6px 12px",
          margin: "4px 0", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Image preview ── */}
      {image && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, margin: "4px 0",
          padding: "6px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--glass-border)",
        }}>
          <img src={image.data} alt={image.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8 }} />
          <span style={{ fontSize: 11.5, color: "var(--text-lo)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {image.name}
          </span>
          <button onClick={() => setImage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)" }} aria-label="Remove image">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Compose bar ── */}
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 8, marginTop: 8,
        padding: "10px 12px", borderRadius: 18,
        background: "rgba(255,255,255,0.05)", border: "1px solid var(--glass-border)",
      }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-faint)", padding: 4, borderRadius: 8,
            transition: "color 0.15s",
          }}
          title="Attach image"
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-blue)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-faint)"}
        >
          <Paperclip size={17} />
        </button>

        <textarea
          ref={textRef}
          rows={1}
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: "var(--text-hi)", fontSize: 13.5, resize: "none",
            fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
          }}
          placeholder={`Message ${firstName}…`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Auto grow
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={onKeyDown}
        />

        {text.trim() || image ? (
          <button
            onClick={send}
            disabled={sending}
            style={{
              background: "linear-gradient(135deg, var(--accent-blue), #5a3fcf)",
              border: "none", borderRadius: "50%", width: 36, height: 36,
              display: "grid", placeItems: "center", cursor: "pointer",
              color: "#fff", flexShrink: 0,
              opacity: sending ? 0.6 : 1,
              transition: "opacity 0.15s, transform 0.1s",
              transform: "scale(1)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.08)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            title="Send"
          >
            <Send size={16} />
          </button>
        ) : (
          <button
            disabled
            style={{
              background: "none", border: "none", color: "var(--text-faint)",
              padding: 4, cursor: "default", flexShrink: 0,
            }}
            title="Voice (coming soon)"
          >
            <Mic size={17} />
          </button>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, fontSize: 10, color: "var(--text-faint)" }}>
        <ShieldCheck size={10} /> Messages are private between you and {firstName}.
        <span style={{ marginLeft: 6, opacity: 0.6 }}>Hold or double-click a bubble to delete.</span>
      </div>
    </div>
  );
}
