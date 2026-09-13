import { useEffect, useMemo, useState } from "react";
import { AtSign, ShieldCheck, MessageCircle } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import DirectMessageThread from "../../components/common/DirectMessageThread";
import { listUsers } from "../../api/users";
import { listDmThreads } from "../../api/messages";
import { ROLE_META } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";

export default function AdminDirectMessage() {
  const { user } = useAuth();
  const [directory, setDirectory] = useState([]);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mention, setMention] = useState("");
  const [selected, setSelected] = useState(null); // { id, name, email, role }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers(), listDmThreads()])
      .then(([users, dmThreads]) => {
        if (cancelled) return;
        setDirectory(users.filter((u) => u.id !== user.id));
        setThreads(dmThreads);
      })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load directory."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id]);

  const refreshThreads = () => {
    listDmThreads().then(setThreads).catch(() => {});
  };

  // Strip a leading "@" and filter by name/email — this is the
  // "@hemesh" mention search that picks who the message goes to.
  const mentionResults = useMemo(() => {
    const q = mention.trim().replace(/^@/, "").toLowerCase();
    if (!q) return [];
    return directory
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mention, directory]);

  const pickUser = (u) => {
    setSelected(u);
    setMention("");
  };

  return (
    <AppShell title="Direct message" subtitle="Admin can reach anyone — type @name to find and message them directly">
      <div className="grid grid-main-side">
        <GlassCard style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 560, overflow: "hidden" }}>
          <div style={{ padding: 18, borderBottom: "1px solid var(--glass-border)" }}>
            <div style={{ position: "relative" }}>
              <AtSign size={14} color="var(--text-faint)" style={{ position: "absolute", left: 12, top: 12 }} />
              <input
                className="field-input"
                style={{ paddingLeft: 32 }}
                placeholder="@hemesh — search anyone by name or email"
                value={mention}
                onChange={(e) => setMention(e.target.value)}
              />
            </div>
            {mentionResults.length > 0 && (
              <div style={{ marginTop: 8, border: "1px solid var(--glass-border)", borderRadius: 10, overflow: "hidden" }}>
                {mentionResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => pickUser(u)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px",
                      background: "rgba(255,255,255,0.02)", border: "none", borderBottom: "1px solid var(--glass-border)",
                      cursor: "pointer", textAlign: "left", color: "inherit",
                    }}
                  >
                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{u.name[0]?.toUpperCase()}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>@{u.name.replace(/\s+/g, "").toLowerCase()}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{u.name} · {u.email}</div>
                    </div>
                    {u.role && (
                      <span className="pill" style={{ fontSize: 10, color: ROLE_META[u.role]?.color, borderColor: `${ROLE_META[u.role]?.color}40` }}>
                        {ROLE_META[u.role]?.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <p style={{ fontSize: 12, color: "var(--text-lo)", padding: 18 }}>Loading conversations…</p>}
            {error && <p style={{ fontSize: 12, color: "var(--accent-rose, #dc2626)", padding: 18 }}>{error}</p>}
            {!loading && threads.length === 0 && !error && (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: 18 }}>
                No conversations yet — use @mention above to message anyone in the system.
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
                    {t.other_user_name[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.other_user_name}</span>
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
            <DirectMessageThread otherUser={selected} onFirstMessageSent={refreshThreads} />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 }}>
              <MessageCircle size={28} color="var(--text-faint)" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: "var(--text-lo)", margin: 0 }}>
                Type <b>@name</b> above to find anyone in the system, or pick an existing conversation.
              </p>
              <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={12} /> Every conversation here is private between admin and that person.
              </p>
            </div>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
