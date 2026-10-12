import { useEffect, useMemo, useState } from "react";
import { AtSign, ShieldCheck, MessageCircle, Search } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import DirectMessageThread from "../../components/common/DirectMessageThread";
import { listUsers } from "../../api/users";
import { listDmThreads } from "../../api/messages";
import { ROLE_META } from "../../data/mockData";
import { useAuth } from "../../context/AuthContext";

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
      <div className="avatar" style={{
        width: 42, height: 42, fontSize: 17, flexShrink: 0,
        background: roleMeta
          ? `linear-gradient(135deg, ${roleMeta.color}aa, ${roleMeta.color}66)`
          : "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))",
      }}>
        {t.other_user_name?.[0]?.toUpperCase() || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.other_user_name || "Unknown"}</span>
          <span style={{ fontSize: 10, color: "var(--text-faint)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
            {lastTime}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
          <span style={{ fontSize: 12, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {t.last_from_me && <span style={{ color: "var(--accent-blue)", marginRight: 2 }}>You: </span>}
            {t.has_attachment && "📷 "}
            {t.last_text || <i>No messages yet</i>}
          </span>
          {roleMeta && (
            <span className="pill desktop-only" style={{ fontSize: 9.5, color: roleMeta.color, borderColor: `${roleMeta.color}40`, marginLeft: 6, flexShrink: 0 }}>
              {roleMeta.label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function AdminDirectMessage() {
  const { user } = useAuth();
  const [directory, setDirectory] = useState([]);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mention, setMention] = useState("");
  const [selected, setSelected] = useState(null);

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
    <AppShell title="Direct Message" subtitle="Admin can reach anyone — type @name to search and message them">
      <div className="grid grid-main-side" style={{ alignItems: "stretch" }}>
        {/* ─── Left panel ─── */}
        <GlassCard style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 580, overflow: "hidden" }}>
          {/* Search bar */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--glass-border)" }}>
            <div style={{ position: "relative" }}>
              <AtSign size={14} color="var(--text-faint)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
              <input
                className="field-input"
                style={{ paddingLeft: 32, fontSize: 13 }}
                placeholder="@name — find anyone to message"
                value={mention}
                onChange={(e) => setMention(e.target.value)}
              />
            </div>

            {/* Mention dropdown */}
            {mentionResults.length > 0 && (
              <div style={{ marginTop: 8, border: "1px solid var(--glass-border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                {mentionResults.map((u) => {
                  const rm = ROLE_META[u.role];
                  return (
                    <button
                      key={u.id}
                      onClick={() => pickUser(u)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.03)", border: "none",
                        borderBottom: "1px solid var(--glass-border)",
                        cursor: "pointer", textAlign: "left", color: "inherit",
                      }}
                    >
                      <div className="avatar" style={{
                        width: 32, height: 32, fontSize: 13,
                        background: rm ? `linear-gradient(135deg, ${rm.color}aa, ${rm.color}55)` : undefined,
                      }}>
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>@{u.name.replace(/\s+/g, "").toLowerCase()}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{u.name} · {u.email}</div>
                      </div>
                      {rm && (
                        <span className="pill" style={{ fontSize: 9.5, color: rm.color, borderColor: `${rm.color}40` }}>
                          {rm.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Thread list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <p style={{ fontSize: 12, color: "var(--text-lo)", padding: "16px 18px" }}>Loading conversations…</p>}
            {error && <p style={{ fontSize: 12, color: "var(--accent-rose, #f43f5e)", padding: "16px 18px" }}>{error}</p>}
            {!loading && threads.length === 0 && !error && (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <Search size={26} color="var(--text-faint)" style={{ margin: "0 auto 12px" }} />
                <p style={{ fontSize: 13, color: "var(--text-lo)", margin: 0 }}>No conversations yet.</p>
                <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
                  Use @mention above to message anyone.
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
            padding: "10px 16px", borderTop: "1px solid var(--glass-border)",
            fontSize: 10.5, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 5,
          }}>
            <ShieldCheck size={10} /> Every conversation is private between admin and that person.
          </div>
        </GlassCard>

        {/* ─── Right panel ─── */}
        <GlassCard style={{ padding: "18px 20px", minHeight: 580, display: "flex", flexDirection: "column" }}>
          {selected ? (
            <DirectMessageThread otherUser={selected} onFirstMessageSent={refreshThreads} />
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
                Start a conversation
              </p>
              <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, maxWidth: 260 }}>
                Type <b>@name</b> above to find anyone in the system, or pick an existing thread.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 20, fontSize: 10.5, color: "var(--text-faint)" }}>
                <ShieldCheck size={11} /> Every conversation here is private between admin and that person.
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
