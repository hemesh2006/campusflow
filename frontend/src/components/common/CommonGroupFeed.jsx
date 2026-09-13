import { useState, useRef, useEffect } from "react";
import { Link2, Users, Send, Paperclip, Image, FileText, Check, Wand2, X, AtSign, ShieldCheck, Bell } from "lucide-react";
import { GlassCard, ProgressBar } from "./Primitives";
import { listDirectory } from "../../api/users";
import { ROLE_META } from "../../data/mockData";

function RenderMessageText({ text }) {
  const parts = (text || "").split(/(\s+)/);
  return (
    <>
      {parts.map((word, i) => {
        if (word.startsWith("http://") || word.startsWith("https://")) {
          return (
            <a key={i} href={word} target="_blank" rel="noreferrer" style={{ color: "var(--accent-blue)", textDecoration: "underline" }}>
              {word}
            </a>
          );
        }
        if (word.startsWith("@") && word.length > 1) {
          return (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 7px",
                borderRadius: 6,
                background: "rgba(59, 130, 246, 0.15)",
                color: "var(--accent-blue)",
                fontWeight: 600,
                fontSize: 12.5,
                margin: "0 2px",
                border: "1px solid rgba(59, 130, 246, 0.25)",
              }}
            >
              <AtSign size={11} />
              {word.slice(1)}
            </span>
          );
        }
        return <span key={i}>{word}</span>;
      })}
    </>
  );
}

function looksUnstructured(text) {
  const t = text.trim();
  if (t.split(/\s+/).length < 7) return false;
  const hasPunctuation = /[.!?,]/.test(t);
  const isLower = t === t.toLowerCase();
  const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
  return !hasPunctuation || isLower || isAllCaps;
}

function suggestFormat(text) {
  let t = text.trim().replace(/\s+/g, " ");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

const ATTACH_OPTIONS = [
  { kind: "image", label: "Photo", file: "drive_notice.png", icon: Image },
  { kind: "pdf", label: "PDF", file: "checklist.pdf", icon: FileText },
];

export default function CommonGroupFeed({
  items,
  title = "Common group",
  groupName = "CSE-C · College Management",
  trackClicks = false,
  allowPost = false,
  posterName = "You",
  moderate = false,
  onSend = null,
  loading = false,
  error = null,
}) {
  const [clicked, setClicked] = useState({});
  const [readIds, setReadIds] = useState({});
  const [posted, setPosted] = useState([]);
  const [draft, setDraft] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  
  // @ Mention directory autocomplete state
  const [directory, setDirectory] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [showMentions, setShowMentions] = useState(false);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    listDirectory()
      .then(setDirectory)
      .catch(() => {});
  }, []);

  const allItems = [...items].reverse().concat(posted);
  const unreadCount = allItems.filter(m => !readIds[m.id]).length;

  // Automatically mark messages as read for the current user when they appear
  useEffect(() => {
    const unreadIds = allItems.filter(m => !readIds[m.id]).map(m => m.id);
    if (unreadIds.length === 0) return;
    // Send PATCH requests to backend for each unread message
    unreadIds.forEach(id => {
      fetch(`/api/messages/read/${id}`, { method: 'PATCH' })
        .then(res => res.json())
        .then(data => {
          setReadIds(prev => ({ ...prev, [id]: true }));
        })
        .catch(() => {});
    });
  }, [allItems, readIds]);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [allItems.length, loading]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setDraft(val);

    // Detect @ mention trigger
    const lastAtIndex = val.lastIndexOf("@");
    if (lastAtIndex !== -1 && (lastAtIndex === 0 || val[lastAtIndex - 1] === " ")) {
      const q = val.slice(lastAtIndex + 1);
      if (!q.includes(" ")) {
        setMentionQuery(q.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
    setMentionQuery(null);
  };

  const handleSelectMention = (u) => {
    const lastAtIndex = draft.lastIndexOf("@");
    const prefix = draft.slice(0, lastAtIndex);
    const firstName = u.name.split(" ")[0];
    const newDraft = `${prefix}@${firstName} `;
    setDraft(newDraft);
    setShowMentions(false);
    setMentionQuery(null);
  };

  const doSend = (text) => {
    setPosted((p) => [
      ...p,
      { id: `local-${Date.now()}`, from: posterName, text, time: "Just now", clicks: 0, total: 34, attachment: pendingAttachment },
    ]);
    setDraft("");
    setPendingAttachment(null);
    setSuggestion(null);
    setShowMentions(false);
    if (onSend) onSend(text);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (moderate && looksUnstructured(text)) {
      setSuggestion({ original: text, suggested: suggestFormat(text) });
      return;
    }
    doSend(text);
  };

  const filteredDirectory = directory.filter((u) => {
    if (!mentionQuery) return true;
    return (
      u.name.toLowerCase().includes(mentionQuery) ||
      u.email.toLowerCase().includes(mentionQuery) ||
      u.role.toLowerCase().includes(mentionQuery) ||
      (u.dept && u.dept.toLowerCase().includes(mentionQuery))
    );
  });

  return (
    <GlassCard style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="h-display" style={{ fontSize: 15 }}>{title}</div>
{unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => bottomRef.current?.scrollIntoView({ block: "end" })} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Bell size={14} /> {unreadCount}
          </button>
        )}
        </div>
      </div>

      <div ref={scrollRef} style={{ maxHeight: 380, overflowY: "auto" }} className="scrollbar-thin">
        {loading && <p style={{ padding: "16px 20px", fontSize: 12.5, color: "var(--text-lo)" }}>Loading messages…</p>}
        {error && <p style={{ padding: "16px 20px", fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</p>}
        {!loading && !error && allItems.length === 0 && (
          <p style={{ padding: "16px 20px", fontSize: 12.5, color: "var(--text-faint)" }}>No messages yet — be the first to post.</p>
        )}
        {!loading && allItems.map((m) => {
          const wasClicked = clicked[m.id];
          const clicks = m.clicks + (wasClicked ? 1 : 0);
          const isRead = !!readIds[m.id];
          return (
            <div key={m.id} style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-blue)" }}>{m.from}</span>
                <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>{m.time}</span>
              </div>
              <p style={{ fontSize: 13.5, margin: "6px 0 8px", color: "var(--text-hi)", lineHeight: 1.6 }}>
                <RenderMessageText text={m.text} />
              </p>

              {m.attachment && (
                <div className="pill" style={{ marginBottom: 8 }}>
                  {(m.attachment.kind || m.attachment.type) === "pdf" ? <FileText size={12} /> : <Image size={12} />}{" "}
                  {m.attachment.file || m.attachment.name || "attachment"}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {m.link && (
                  <button
                    onClick={() => setClicked((c) => ({ ...c, [m.id]: true }))}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    <Link2 size={12} /> {m.link}
                  </button>
                )}
                <button
  onClick={() => setReadIds((r) => ({ ...r, [m.id]: !r[m.id] }))}
  className="btn btn-ghost btn-sm"
  style={{ padding: "5px 10px", fontSize: 12, color: isRead ? "var(--accent-emerald)" : "var(--text-mid)" }}
>
  <Check size={12} /> {isRead ? "Read" : "Mark as read"}
  {m.read_count > 0 && (
    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-faint)" }}>
      👁️ {m.read_count}
    </span>
  )}
</button>
              </div>

              {trackClicks && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-lo)", marginBottom: 4 }}>
                    <span>Seen by {clicks}/{m.total}</span>
                    <span>{Math.round((clicks / m.total) * 100)}%</span>
                  </div>
                  <ProgressBar value={clicks} max={m.total} color="var(--accent-cyan)" height={4} />
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {allowPost && (
        <div style={{ borderTop: "1px solid var(--glass-border)", position: "relative" }}>
          {/* @ Mention Autocomplete Popup */}
          {showMentions && filteredDirectory.length > 0 && (
            <div
              className="glass"
              style={{
                position: "absolute",
                bottom: "100%",
                left: 16,
                right: 16,
                maxHeight: 180,
                overflowY: "auto",
                background: "var(--bg-card, #1e293b)",
                border: "1px solid var(--glass-border)",
                borderRadius: 10,
                zIndex: 20,
                boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                padding: "6px 0",
              }}
            >
              <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Mention Registered Member (@)
              </div>
              {filteredDirectory.slice(0, 6).map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectMention(u)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-hi)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12.5,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="avatar" style={{ width: 24, height: 24, fontSize: 11 }}>{u.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-lo)" }}>{u.email}</div>
                  </div>
                  <span className="pill" style={{ fontSize: 10 }}>{ROLE_META[u.role]?.label || u.role}</span>
                </button>
              ))}
            </div>
          )}

          {suggestion && (
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--glass-border)", background: "rgba(232,149,46,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--accent-amber)", fontWeight: 600, marginBottom: 8 }}>
                <Wand2 size={13} /> Unstructured format detected — approve cleaned version?
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-mid)", marginBottom: 6 }}>
                <span style={{ color: "var(--text-faint)" }}>Original: </span>{suggestion.original}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-hi)", marginBottom: 10 }}>
                <span style={{ color: "var(--text-faint)" }}>Suggested: </span>{suggestion.suggested}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => doSend(suggestion.suggested)}>Approve & send</button>
                <button className="btn btn-ghost btn-sm" onClick={() => doSend(suggestion.original)}>Send original</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSuggestion(null)}><X size={13} /></button>
              </div>
            </div>
          )}

          {pendingAttachment && (
            <div style={{ padding: "8px 16px 0" }}>
              <span className="pill">
                {pendingAttachment.kind === "pdf" ? <FileText size={12} /> : <Image size={12} />} {pendingAttachment.file}
                <button onClick={() => setPendingAttachment(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", display: "flex" }}>
                  <X size={11} />
                </button>
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, padding: "12px 16px", position: "relative" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAttachMenuOpen((o) => !o)} aria-label="Attach">
              <Paperclip size={14} />
            </button>
            {attachMenuOpen && (
              <div className="glass" style={{ position: "absolute", bottom: 46, left: 16, padding: 6, display: "flex", flexDirection: "column", gap: 2, background: "#fff", zIndex: 5 }}>
                {ATTACH_OPTIONS.map((o) => (
                  <button
                    key={o.kind}
                    className="btn btn-ghost btn-sm"
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => { setPendingAttachment(o); setAttachMenuOpen(false); }}
                  >
                    <o.icon size={13} /> {o.label}
                  </button>
                ))}
              </div>
            )}
            <input
              className="field-input"
              placeholder="Message group… (type @ to mention Admin, HOD, Advisor, etc.)"
              value={draft}
              onChange={handleInputChange}
              onKeyDown={(e) => e.key === "Enter" && !showMentions && send()}
            />
            <button className="btn btn-primary btn-sm" onClick={send} aria-label="Send"><Send size={14} /></button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
