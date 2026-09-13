import { useEffect, useState } from "react";
import { GraduationCap, AlertTriangle, MessageSquare, Bot, Percent } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import { StatStrip } from "../../components/common/StatRing";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listAdvisorStudents } from "../../api/users";
import { listAgents } from "../../api/agents";
import { listMessages, postMessage } from "../../api/messages";
import { useAuth } from "../../context/AuthContext";

const GROUP = "CSE-C";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function AdvisorDashboard() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [agents, setAgents] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAdvisorStudents(), listAgents()])
      .then(([s, a]) => { if (!cancelled) { setStudents(s); setAgents(a); } })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load dashboard data."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    listMessages(GROUP)
      .then((data) => { if (!cancelled) setFeed(data.map(toFeedItem)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFeedLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const handleSend = async (text) => {
    try {
      await postMessage({ group: GROUP, text });
    } catch {
      setError("Message may not have been saved — check your connection.");
    }
  };

  const attendances = students.map((s) => s.attendance).filter((v) => typeof v === "number");
  const avgAttendance = attendances.length ? Math.round(attendances.reduce((s, x) => s + x, 0) / attendances.length) : null;
  const atRisk = students.filter((s) => (typeof s.attendance === "number" && s.attendance < 75) || (s.tasks_total > 0 && s.tasks_done < s.tasks_total - 3));
  const advisorAgent = agents.find((a) => a.owner_id === user?.id) || agents.find((a) => a.role === "advisor");

  return (
    <AppShell title={`${user?.dept || "Class"} board`} subtitle={`${user?.name || "Class Advisor"} — Class Advisor`}>
      <div style={{ marginBottom: 18 }}>
        <StatStrip
          items={[
            { icon: GraduationCap, label: "Students", value: students.length, sub: "assigned to your class", percent: 100, tone: "var(--accent-amber)" },
            { icon: Percent, label: "Avg. attendance", value: avgAttendance !== null ? `${avgAttendance}%` : "—", sub: "class average", percent: avgAttendance ?? 0, tone: "var(--accent-cyan)" },
            { icon: AlertTriangle, label: "Needs attention", value: atRisk.length, sub: "low attendance or tasks", percent: students.length ? (atRisk.length / students.length) * 100 : 0, tone: "var(--accent-rose)" },
            { icon: Bot, label: "Your agent", value: advisorAgent ? (advisorAgent.status === "running" ? "Active" : "Idle") : "None", sub: advisorAgent ? `${advisorAgent.accuracy}% accuracy` : "no agent assigned", percent: advisorAgent?.accuracy ?? 0, tone: "var(--accent-emerald)" },
          ]}
        />
      </div>

      {error && (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>
      )}

      <div className="grid grid-main-side">
        <GlassCard style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <span className="eyebrow">Class roster snapshot</span>
            <span style={{ fontSize: 12, color: "var(--text-lo)" }}>Full detail under Students</span>
          </div>

          {loading && <p style={{ fontSize: 12.5, color: "var(--text-lo)" }}>Loading roster…</p>}
          {!loading && students.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
              No students in your class yet — add some from the Students page.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {students.map((s) => (
              <div key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span>{s.name}</span>
                  <span style={{ color: "var(--text-lo)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {s.tasks_done}/{s.tasks_total} tasks{typeof s.attendance === "number" ? ` · ${s.attendance}%` : ""}
                  </span>
                </div>
                <ProgressBar
                  value={s.tasks_done} max={s.tasks_total || 1}
                  color={s.tasks_total > 0 && s.tasks_done < s.tasks_total - 3 ? "var(--accent-rose)" : "var(--accent-blue)"}
                />
              </div>
            ))}
          </div>

          {atRisk.length > 0 && (
            <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "rgba(239,111,142,0.08)", border: "1px solid rgba(239,111,142,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--accent-rose)", marginBottom: 4 }}>
                <AlertTriangle size={15} /> {atRisk.length} student(s) flagged by the Agent Manager
              </div>
              <p style={{ fontSize: 12, color: "var(--text-mid)", margin: 0 }}>
                {atRisk.map((s) => s.name).join(", ")} — review accountability bias under Students before escalating.
              </p>
            </div>
          )}
        </GlassCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <CommonGroupFeed
            items={feed}
            trackClicks
            title="Common group"
            groupName={`${user?.dept || "CSE-C"} · College Management`}
            allowPost
            posterName={user ? `${user.name} (You)` : "You"}
            onSend={handleSend}
            loading={feedLoading}
          />
          <GlassCard style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <MessageSquare size={15} color="var(--accent-amber)" />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Conduct reminder</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-lo)", lineHeight: 1.6 }}>
              Messages sent through the class agent are logged. Keep language
              respectful — flagged tone is escalated to the HOD automatically.
            </p>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
