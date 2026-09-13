import { useEffect, useState } from "react";
import { MessageCircle, ShieldCheck } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import DirectMessageThread from "../../components/common/DirectMessageThread";
import { listDmThreads } from "../../api/messages";
import { ROLE_META } from "../../data/mockData";

export default function MyMessages() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const refresh = () => {
    listDmThreads()
      .then((data) => {
        setThreads(data);
        // Auto-open the most recent thread on first load, if any.
        setSelected((cur) => cur || data[0] || null);
      })
      .catch((err) => setError(err.message || "Failed to load messages."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000); // pick up new incoming threads (e.g. a fresh DM from admin)
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Messages" subtitle="Direct messages between you and admin, HOD, or your advisor">
      <div className="grid grid-main-side">
        <GlassCard style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 560, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--glass-border)" }}>
            <span className="eyebrow">Conversations</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <p style={{ fontSize: 12, color: "var(--text-lo)", padding: 18 }}>Loading…</p>}
            {error && <p style={{ fontSize: 12, color: "var(--accent-rose, #dc2626)", padding: 18 }}>{error}</p>}
            {!loading && threads.length === 0 && !error && (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: 18 }}>
                No direct messages yet. When someone messages you directly, it'll show up here.
              </p>
            )}
            {threads.map((t) => {
              const isActive = selected?.id === t.other_user_id;
              const roleMeta = t.other_user_role ? ROLE_META[t.other_user_role] : null;
              return (
                <button
                  key={t.group}
                  onClick={() => setSelected({ id: t.other_user_id, name: t.other_user_name, role: t.other_user_role })}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 18px",
                    background: isActive ? "rgba(59,108,246,0.08)" : "transparent", border: "none",
                    borderBottom: "1px solid var(--glass-border)", cursor: "pointer", textAlign: "left", color: "inherit",
                  }}
                >
                  <div className="avatar" style={{ background: "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))" }}>
                    {t.other_user_name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.other_user_name || "Unknown user"}</span>
                      <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                        {new Date(t.last_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.last_from_me ? "You: " : ""}{t.has_attachment ? "📷 " : ""}{t.last_text}
                    </div>
                  </div>
                  {roleMeta && (
                    <span className="pill desktop-only" style={{ fontSize: 10, color: roleMeta.color, borderColor: `${roleMeta.color}40` }}>
                      {roleMeta.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard style={{ padding: 20, minHeight: 560 }}>
          {selected ? (
            <DirectMessageThread otherUser={selected} onFirstMessageSent={refresh} />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 }}>
              <MessageCircle size={28} color="var(--text-faint)" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: "var(--text-lo)", margin: 0 }}>
                Nothing selected yet — pick a conversation on the left.
              </p>
              <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={12} /> Direct messages are private between you and the sender.
              </p>
            </div>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
