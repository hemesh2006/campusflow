import { useEffect, useState } from "react";
import { Building2, Users, GraduationCap, TrendingUp, MessageSquare } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import { StatStrip } from "../../components/common/StatRing";
import {
  listDepartmentsOverview, getInstitutionSummary, listStaffActivity, listCompletionByStudent,
} from "../../api/overview";

export default function PrincipalDashboard() {
  const [depts, setDepts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [staff, setStaff] = useState([]);
  const [completion, setCompletion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listDepartmentsOverview(), getInstitutionSummary(), listStaffActivity(), listCompletionByStudent()])
      .then(([d, s, st, c]) => {
        if (cancelled) return;
        setDepts(d);
        setSummary(s);
        setStaff(st);
        setCompletion(c);
      })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load institution overview."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title="Institution overview" subtitle="All departments">
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading institution data…</p>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="Institution overview" subtitle="All departments">
        <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Institution overview" subtitle="All departments">
      <div style={{ marginBottom: 18 }}>
        <StatStrip
          items={[
            { icon: Users, label: "Total students", value: summary.total_students, sub: `across ${summary.total_departments} departments`, percent: 100, tone: "var(--accent-violet)" },
            { icon: Building2, label: "Departments", value: summary.total_departments, sub: "each with a HOD", percent: 100, tone: "var(--accent-blue)" },
            { icon: TrendingUp, label: "Overall completion", value: `${summary.overall_completion_rate}%`, sub: "tasks closed", percent: summary.overall_completion_rate, tone: "var(--accent-emerald)" },
            { icon: MessageSquare, label: "Messages this week", value: summary.messages_this_week, sub: "across all groups", percent: 70, tone: "var(--accent-amber)" },
          ]}
        />
      </div>

      <div className="grid grid-main-side">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 20 }}>
            <span className="eyebrow">Departments — load & agents</span>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 15 }}>
              {depts.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No departments with students yet.</p>}
              {depts.map((d) => (
                <div key={d.dept}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 500 }}>{d.dept}</span>
                    <span style={{ color: "var(--text-lo)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                      {d.students} students · {d.advisors} advisors · {d.agents_running} agents
                    </span>
                  </div>
                  <ProgressBar value={d.students} max={Math.max(220, d.students)} />
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 20 }}>
            <span className="eyebrow">Completion rate by student</span>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 13 }}>
              {completion.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No students yet.</p>}
              {completion.slice(0, 12).map((s) => (
                <div key={`${s.name}-${s.dept}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{s.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span>{s.name}{s.dept ? ` · ${s.dept}` : ""}</span>
                      <span style={{ color: s.rate < 60 ? "var(--accent-rose)" : "var(--text-mid)" }}>{s.rate}%</span>
                    </div>
                    <ProgressBar value={s.rate} color={s.rate < 60 ? "var(--accent-rose)" : "var(--accent-emerald)"} height={5} />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Staff involvement — HOD & advisors</span>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
              {staff.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No staff activity recorded yet.</p>}
              {staff.map((s) => (
                <div key={`${s.name}-${s.role}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{s.role}</div>
                    </div>
                    <span style={{ color: "var(--text-mid)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{s.activity}%</span>
                  </div>
                  <ProgressBar value={s.activity} color="var(--accent-violet)" height={5} />
                  <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--text-faint)", marginTop: 4 }}>
                    <span>{s.messages_sent} messages</span>
                    <span>{s.tasks_reviewed} tasks reviewed</span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <GraduationCap size={15} color="var(--accent-blue)" />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Reading this page</span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-lo)", lineHeight: 1.7 }}>
              Completion rate and staff activity are computed live from the
              same task and message data students and advisors see —
              nothing here is a separate report.
            </p>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
