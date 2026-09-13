import { useState, useEffect, useCallback } from "react";
import { Building2, Users, Bot, AlertTriangle, UserCheck, UserPlus } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, StatusDot, ProgressBar, RoleBadge } from "../../components/common/Primitives";
import { StatStrip } from "../../components/common/StatRing";
import { ROLE_META } from "../../data/mockData";
import { api } from "../../api/client";
import { listAdvisorStudents, listHierarchyCandidates, assignAdvisor, removeHierarchyRole } from "../../api/users";
import { listReports } from "../../api/reports";
import { listDepartmentsOverview } from "../../api/overview";
import { useAuth } from "../../context/AuthContext";

export default function HodDashboard() {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [students, setStudents] = useState([]);
  const [reports, setReports] = useState([]);
  const [dept, setDept] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(() => {
    return Promise.all([
      api.get("/agents"),
      listAdvisorStudents(),
      listReports(),
      listDepartmentsOverview(),
      listHierarchyCandidates("advisor"),
    ])
      .then(([a, s, r, depts, cands]) => {
        setAgents(a);
        setStudents(s);
        setReports(r);
        setDept(depts.find((d) => d.dept === user?.dept) || null);
        setCandidates(cands);
      })
      .catch((err) => { setError(err.message || "Failed to load dashboard data."); });
  }, [user?.dept]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssignAdvisor = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    setError(null);
    try {
      await assignAdvisor(selectedUser, user?.dept);
      setSelectedUser("");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to assign Class Advisor.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAdvisor = async (userId) => {
    setBusy(true);
    setError(null);
    try {
      await removeHierarchyRole(userId);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to remove Class Advisor.");
    } finally {
      setBusy(false);
    }
  };

  const deptAgents = agents.filter((a) => ["advisor", "student", "hod"].includes(a.role));
  const runningAgents = deptAgents.filter((a) => a.status === "running").length;
  const openReports = reports.filter((r) => r.status !== "resolved").length;
  const currentAdvisors = candidates.filter((u) => u.role === "advisor" && u.dept === user?.dept);

  return (
    <AppShell title={`${user?.dept || "Department"}`} subtitle={`${user?.name || "HOD"} — HOD Overview & Advisor Management`}>
      {error && <div style={{ marginBottom: 14, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>}

      <div style={{ marginBottom: 18 }}>
        <StatStrip
          items={[
            { icon: Users, label: "Students", value: students.length || 0, sub: "in your department", percent: 100, tone: "var(--accent-emerald)" },
            { icon: Building2, label: "Class advisors", value: currentAdvisors.length, sub: "reporting to you", percent: 100, tone: "var(--accent-cyan)" },
            { icon: Bot, label: "Agents running", value: runningAgents, sub: `of ${deptAgents.length} in scope`, percent: deptAgents.length ? (runningAgents / deptAgents.length) * 100 : 0, tone: "var(--accent-violet)" },
            { icon: AlertTriangle, label: "Open reports", value: openReports, sub: "needs review", percent: reports.length ? (openReports / reports.length) * 100 : 0, tone: "var(--accent-rose)" },
          ]}
        />
      </div>

      {/* Class Advisor Assignment Section */}
      <GlassCard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <UserPlus size={18} color="var(--role-advisor, #10b981)" />
          <h2 className="h-display" style={{ fontSize: 16, margin: 0 }}>Assign Class Advisor ({user?.dept || "Department"})</h2>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 14px", lineHeight: 1.6 }}>
          Members must sign up first. Pick a registered account to appoint as Class Advisor for {user?.dept || "your department"}.
        </p>
        <form onSubmit={handleAssignAdvisor} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="field-label" htmlFor="adv-cand-select">Registered User</label>
            <select
              id="adv-cand-select"
              className="field-input"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              required
            >
              <option value="">-- Select Registered User --</option>
              {candidates.filter((c) => c.role !== "advisor").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) - Role: {c.role}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 20 }} disabled={busy || !selectedUser}>
            <UserCheck size={14} /> {busy ? "Assigning…" : "Assign Class Advisor"}
          </button>
        </form>
      </GlassCard>

      {/* Current Advisors List */}
      <GlassCard style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)" }}>
          <span className="eyebrow">Class Advisors in {user?.dept || "Department"} ({currentAdvisors.length})</span>
        </div>
        {currentAdvisors.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-faint)" }}>
            No Class Advisors assigned to this department yet. Use the form above to assign a registered user.
          </div>
        ) : (
          currentAdvisors.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--glass-border)" }}>
              <div className="avatar" style={{ background: "var(--role-advisor, #10b981)" }}>{a.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-lo)", fontFamily: "var(--font-mono)" }}>{a.email}</div>
              </div>
              <RoleBadge role={a.role} meta={ROLE_META} />
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--accent-rose, #dc2626)" }}
                onClick={() => handleRemoveAdvisor(a.id)}
                disabled={busy}
              >
                Remove Advisor
              </button>
            </div>
          ))
        )}
      </GlassCard>

      <div className="grid grid-main-side">
        <GlassCard style={{ padding: 20 }}>
          <span className="eyebrow">Students in your department</span>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {students.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No students in your department yet.</p>}
            {students.slice(0, 8).map((s) => (
              <div key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span>{s.name}</span>
                  <span style={{ color: "var(--text-lo)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {s.tasks_done}/{s.tasks_total} tasks
                  </span>
                </div>
                <ProgressBar value={s.tasks_done} max={s.tasks_total || 1} />
              </div>
            ))}
          </div>
        </GlassCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Department task completion</span>
            <div style={{ marginTop: 14 }}>
              {dept ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ color: "var(--text-mid)" }}>Avg. completion</span>
                    <span>{dept.avg_completion}%</span>
                  </div>
                  <ProgressBar value={dept.avg_completion} color={dept.avg_completion < 50 ? "var(--accent-rose)" : "var(--accent-emerald)"} />
                </>
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Not enough data yet.</p>
              )}
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Recent reports</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {reports.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No reports filed in your department.</p>}
              {reports.slice(0, 5).map((r) => (
                <div key={r.id} style={{ fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 500 }}>{r.from_name}</span>
                    <span className="pill" style={{ fontSize: 10 }}>{r.status}</span>
                  </div>
                  <div style={{ color: "var(--text-lo)", marginTop: 2 }}>{r.subject}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
