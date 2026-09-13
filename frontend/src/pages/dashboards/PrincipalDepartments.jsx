import { useEffect, useState, useCallback } from "react";
import { UserCheck, RefreshCw, AlertCircle, Building2, UserPlus, ShieldAlert } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, StatusDot, ProgressBar, RoleBadge } from "../../components/common/Primitives";
import { DEPARTMENTS, ROLE_META } from "../../data/mockData";
import { listDepartmentsOverview } from "../../api/overview";
import { listHierarchyCandidates, assignHod, removeHierarchyRole } from "../../api/users";

export default function PrincipalDepartments() {
  const [depts, setDepts] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  const [selectedUser, setSelectedUser] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([listDepartmentsOverview(), listHierarchyCandidates("hod")])
      .then(([overview, cands]) => {
        setDepts(overview);
        setCandidates(cands);
      })
      .catch((err) => setError(err.message || "Failed to load department hierarchy data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssignHod = async (e) => {
    e.preventDefault();
    if (!selectedUser || !selectedDept) return;
    setBusy(true);
    setError(null);
    try {
      await assignHod(selectedUser, selectedDept);
      setSelectedUser("");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to assign HOD.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveHod = async (userId) => {
    setBusy(true);
    setError(null);
    try {
      await removeHierarchyRole(userId);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to remove HOD.");
    } finally {
      setBusy(false);
    }
  };

  const currentHods = candidates.filter((u) => u.role === "hod");

  return (
    <AppShell title="Departments & HOD Hierarchy" subtitle="Principal oversight — assign registered users as Department HODs">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, maxWidth: 540, lineHeight: 1.6 }}>
          Members must sign up first. Pick a registered account from below to assign as HOD for a department.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16, borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "var(--accent-rose, #dc2626)", fontSize: 12.5 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Assign HOD Card */}
      <GlassCard style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <UserPlus size={18} color="var(--role-hod, #3b82f6)" />
          <h2 className="h-display" style={{ fontSize: 16, margin: 0 }}>Assign HOD to Department</h2>
        </div>
        <form onSubmit={handleAssignHod} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label" htmlFor="cand-select">Registered User</label>
            <select
              id="cand-select"
              className="field-input"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              required
            >
              <option value="">-- Select Registered User --</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}) - Role: {c.role} {c.dept ? `[${c.dept}]` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 180 }}>
            <label className="field-label" htmlFor="dept-select">Department</label>
            <select
              id="dept-select"
              className="field-input"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              required
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 20 }} disabled={busy || !selectedUser}>
            <UserCheck size={14} /> {busy ? "Assigning…" : "Assign HOD"}
          </button>
        </form>
      </GlassCard>

      {/* Current HOD List */}
      <GlassCard style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)" }}>
          <span className="eyebrow">Assigned Department HODs</span>
        </div>
        {currentHods.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12.5, color: "var(--text-faint)" }}>
            No HODs assigned yet. Use the form above to assign a registered user as HOD.
          </div>
        ) : (
          currentHods.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--glass-border)" }}>
              <div className="avatar" style={{ background: "var(--role-hod, #3b82f6)" }}>{h.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{h.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-lo)", fontFamily: "var(--font-mono)" }}>{h.email}</div>
              </div>
              <span className="pill" style={{ fontWeight: 600 }}>{h.dept}</span>
              <RoleBadge role={h.role} meta={ROLE_META} />
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--accent-rose, #dc2626)" }}
                onClick={() => handleRemoveHod(h.id)}
                disabled={busy}
              >
                Remove HOD
              </button>
            </div>
          ))
        )}
      </GlassCard>

      {/* Department Cards Overview */}
      <h3 className="eyebrow" style={{ marginBottom: 12 }}>Department Activity & Performance</h3>
      <div className="grid grid-3">
        {depts.map((d) => (
          <GlassCard key={d.dept} style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span className="h-display" style={{ fontSize: 15 }}>{d.dept}</span>
              <StatusDot status={d.avg_completion < 50 ? "warn" : "running"} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-lo)", marginBottom: 14, lineHeight: 1.7 }}>
              {d.students} students · {d.advisors} advisors<br />{d.agents_running} agents running
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
              <span style={{ color: "var(--text-mid)" }}>Avg. task completion</span>
              <span style={{ color: d.avg_completion < 50 ? "var(--accent-rose)" : "var(--text-hi)" }}>{d.avg_completion}%</span>
            </div>
            <ProgressBar value={d.avg_completion} color={d.avg_completion < 50 ? "var(--accent-rose)" : "var(--accent-emerald)"} />
          </GlassCard>
        ))}
      </div>
    </AppShell>
  );
}
