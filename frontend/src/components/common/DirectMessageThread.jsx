import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { listMessages, postMessage, dmGroup } from "../../api/messages";
import { ROLE_META } from "../../data/mockData";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // ~3MB raw, keeps the base64 doc well under Mongo's 16MB limit
const POLL_MS = 3000;

// Renders "@Hemesh" style mentions inside a message bubble in accent
// color — purely cosmetic, the actual recipient is fixed by the thread.
function renderWithMentions(text) {
  const parts = text.split(/(@[\w.]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} style={{ color: "var(--accent-blue)", fontWeight: 600 }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function DirectMessageThread({ otherUser, onFirstMessageSent }) {
  const { user } = useAuth();
  const safeName = otherUser?.name || "Unknown user";
  const firstName = safeName.split(" ")[0];
  const group = dmGroup(user.id, otherUser?.id);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null); // { data, name }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    const fetchMessages = () => {
      listMessages(group)
        .then((data) => { if (!cancelled) setMessages(data.slice().reverse()); })
        .catch((err) => { if (!cancelled) setError(err.message || "Failed to load messages."); });
    };
    fetchMessages();
    const id = setInterval(fetchMessages, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [group]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be attached.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large — please use one under 3MB.");
      return;
    }
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
      if (wasFirst) onFirstMessageSent?.();
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const roleMeta = otherUser.role ? ROLE_META[otherUser.role] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 460 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 14px", borderBottom: "1px solid var(--glass-border)", marginBottom: 14 }}>
        <div className="avatar" style={{ background: "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))" }}>
          {safeName[0]?.toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{safeName}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {otherUser.email || (roleMeta ? roleMeta.label : "")}
          </div>
        </div>
        {roleMeta && (
          <span className="pill" style={{ marginLeft: "auto", color: roleMeta.color, borderColor: `${roleMeta.color}40`, fontSize: 10.5 }}>
            {roleMeta.label}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "2px 2px 10px" }}>
        {messages === null && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading conversation…</p>}
        {messages?.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
            No messages yet — say hello to {firstName}.
          </p>
        )}
        {messages?.map((m) => {
          const mine = m.from_user_id === user.id;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "78%", padding: "9px 12px", borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: mine ? "var(--accent-blue)" : "rgba(255,255,255,0.06)",
                  color: mine ? "#fff" : "var(--text-hi)",
                }}
              >
                {m.attachment?.type === "image" && (
                  <img
                    src={m.attachment.data}
                    alt={m.attachment.name || "attachment"}
                    style={{ maxWidth: "100%", borderRadius: 10, marginBottom: m.text ? 6 : 0, display: "block" }}
                  />
                )}
                {m.text && <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{renderWithMentions(m.text)}</div>}
                <div style={{ fontSize: 9.5, marginTop: 4, opacity: 0.65, fontFamily: "var(--font-mono)" }}>
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div style={{ fontSize: 11.5, color: "var(--accent-rose, #dc2626)", marginBottom: 8 }}>{error}</div>
      )}

      {image && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
          <img src={image.data} alt={image.name} style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6 }} />
          <span style={{ fontSize: 11.5, color: "var(--text-lo)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{image.name}</span>
          <button onClick={() => setImage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)" }} aria-label="Remove image">
            <X size={13} />
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-ghost btn-sm"
          style={{ padding: "9px 10px" }}
          title="Attach image"
        >
          <Paperclip size={15} />
        </button>
        <textarea
          className="field-input"
          rows={1}
          style={{ resize: "none", flex: 1 }}
          placeholder={`Message ${firstName}… (@mention supported)`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={sending || (!text.trim() && !image)}>
          <Send size={14} /> {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 10.5, color: "var(--text-faint)" }}>
        <ShieldCheck size={11} /> Private to you and {firstName} only.
      </div>
    </div>
  );
}
