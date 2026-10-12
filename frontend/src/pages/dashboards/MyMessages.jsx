import { useEffect, useState } from "react";
import { MessageCircle, ShieldCheck, Plus } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import DirectMessageThread from "../../components/common/DirectMessageThread";
import { listDmThreads } from "../../api/messages";
import { ROLE_META } from "../../data/mockData";

function ThreadRow({ t, isActive, onClick }) {
  const roleMeta = t.other_user_role ? ROLE_META[t.other_user_role] : null;
  const lastTime = t.last_at
    ? new Date(t.last_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "12px 16px",
        background: isActive
          ? "linear-gradient(90deg, rgba(59,108,246,0.12), rgba(90,63,207,0.06))"
          : "transparent",
        border: "none",
        borderBottom: "1px solid var(--glass-border)",
        borderLeft: isActive ? "3px solid var(--accent-blue)" : "3px solid transparent",
        cursor: "pointer", textAlign: "left", color: "inherit",
        transition: "background 0.18s",
      }}
    >
      {/* Avatar with role color ring */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          className="avatar"
          style={{
            width: 42, height: 42, fontSize: 17,
            background: roleMeta
              ? `linear-gradient(135deg, ${roleMeta.color}aa, ${roleMeta.color}66)`
              : "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))",
          }}
        >
          {t.other_user_name?.[0]?.toUpperCase() || "?"}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }}>
            {t.other_user_name || "Unknown user"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-faint)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
            {lastTime}
          </span>
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 12, color: "var(--text-faint)", marginTop: 3,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {t.last_from_me && (
              <span style={{ color: "var(--accent-blue)", marginRight: 2 }}>You: </span>
            )}
            {t.has_attachment && "📷 "}
            {t.last_text || <i>No messages yet</i>}
          </span>
          {roleMeta && (
            <span
              className="pill desktop-only"
              style={{ fontSize: 9.5, color: roleMeta.color, borderColor: `${roleMeta.color}40`, marginLeft: 6, flexShrink: 0 }}
            >
              {roleMeta.label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function MyMessages() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const refresh = () => {
    listDmThreads()
      .then((data) => {
        setThreads(data);
        setSelected((cur) => cur || data[0] || null);
      })
      .catch((err) => setError(err.message || "Failed to load messages."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Messages" subtitle="Private direct messages between you and staff">
      <div className="grid grid-main-side" style={{ alignItems: "stretch" }}>
        {/* ─── Left: thread list ─── */}
        <GlassCard style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 580, overflow: "hidden" }}>
          <div style={{
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--glass-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span className="eyebrow" style={{ fontSize: 11 }}>Conversations</span>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {threads.length > 0 ? `${threads.length} thread${threads.length > 1 ? "s" : ""}` : ""}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && (
              <p style={{ fontSize: 12, color: "var(--text-lo)", padding: "16px 18px" }}>Loading…</p>
            )}
            {error && (
              <p style={{ fontSize: 12, color: "var(--accent-rose, #f43f5e)", padding: "16px 18px" }}>{error}</p>
            )}
            {!loading && threads.length === 0 && !error && (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <MessageCircle size={28} color="var(--text-faint)" style={{ margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--text-lo)", margin: 0 }}>
                  No direct messages yet.
                </p>
                <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
                  When someone messages you, it'll appear here.
                </p>
              </div>
            )}
            {threads.map((t) => (
              <ThreadRow
                key={t.group}
                t={t}
                isActive={selected?.id === t.other_user_id}
                onClick={() => setSelected({ id: t.other_user_id, name: t.other_user_name, role: t.other_user_role })}
              />
            ))}
          </div>

          <div style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--glass-border)",
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 10.5, color: "var(--text-faint)",
          }}>
            <ShieldCheck size={10} /> All messages are private and encrypted in transit.
          </div>
        </GlassCard>

        {/* ─── Right: chat thread ─── */}
        <GlassCard style={{ padding: "18px 20px", minHeight: 580, display: "flex", flexDirection: "column" }}>
          {selected ? (
            <DirectMessageThread otherUser={selected} onFirstMessageSent={refresh} />
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              textAlign: "center", padding: 30,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--glass-border)",
                display: "grid", placeItems: "center", marginBottom: 16,
              }}>
                <MessageCircle size={28} color="var(--text-faint)" />
              </div>
              <p style={{ fontSize: 14, color: "var(--text-lo)", margin: "0 0 8px", fontWeight: 600 }}>
                No conversation selected
              </p>
              <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, maxWidth: 260 }}>
                Pick a conversation on the left to start chatting.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 20, fontSize: 10.5, color: "var(--text-faint)" }}>
                <ShieldCheck size={11} /> Messages are private between you and the sender.
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
