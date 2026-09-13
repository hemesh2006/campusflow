import { useState, useEffect, useCallback } from "react";
import { UserPlus, UserMinus, ChevronDown, ChevronUp, Link2, Users, RefreshCw, Save, Award, Percent } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import FairnessSlider from "../../components/common/FairnessSlider";
import { listAdvisorStudents, listUnassignedStudents, addStudentToClass, removeStudentFromClass, updateStudentAcademic } from "../../api/users";
import { useAuth } from "../../context/AuthContext";

function StudentRow({ s, expanded, onToggle, actionLabel, actionIcon: ActionIcon, onAction, actionBusy, actionTone = "primary", onSaveAcademic }) {
  const [cgpa, setCgpa] = useState(s.cgpa ?? "");
  const [attendance, setAttendance] = useState(s.attendance ?? "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setCgpa(s.cgpa ?? "");
    setAttendance(s.attendance ?? "");
  }, [s.cgpa, s.attendance]);

  const handleSaveAcademic = async (e) => {
    e.preventDefault();
    if (!onSaveAcademic) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await onSaveAcademic(s.id, {
        cgpa: cgpa !== "" ? parseFloat(cgpa) : null,
        attendance: attendance !== "" ? parseFloat(attendance) : null,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ borderBottom: "1px solid var(--glass-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14,
            background: "transparent", border: "none", color: "inherit", cursor: "pointer", textAlign: "left", padding: 0,
          }}
        >
          <div className="avatar" style={{ background: "linear-gradient(135deg, var(--accent-amber), var(--accent-rose))" }}>
            {s.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-lo)" }}>{s.email}{s.dept ? ` · ${s.dept}` : ""}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginRight: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>CGPA</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.cgpa ? "var(--accent-emerald)" : "var(--text-lo)", fontFamily: "var(--font-mono)" }}>
                {s.cgpa != null ? s.cgpa.toFixed(2) : "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>Attendance</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.attendance != null ? (s.attendance < 75 ? "var(--accent-rose)" : "var(--text-hi)") : "var(--text-lo)", fontFamily: "var(--font-mono)" }}>
                {s.attendance != null ? `${s.attendance}%` : "—"}
              </div>
            </div>
          </div>

          {expanded ? <ChevronUp size={16} color="var(--text-lo)" /> : <ChevronDown size={16} color="var(--text-lo)" />}
        </button>
        {onAction && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction(s); }}
            disabled={actionBusy}
            className="btn btn-sm"
            style={{
              flexShrink: 0,
              background: actionTone === "danger" ? "rgba(220,38,38,0.1)" : "var(--accent-blue)",
              color: actionTone === "danger" ? "var(--accent-rose, #dc2626)" : "#fff",
              border: actionTone === "danger" ? "1px solid rgba(220,38,38,0.25)" : "none",
            }}
          >
            <ActionIcon size={13} /> {actionBusy ? "Working…" : actionLabel}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "0 20px 22px 66px" }}>
          <div className="grid grid-2" style={{ gap: 20 }}>
            {/* Academic Entry Form for Class Advisor */}
            {onSaveAcademic && (
              <div style={{ background: "var(--glass-bg)", padding: 14, borderRadius: 10, border: "1px solid var(--glass-border)" }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 10 }}>Class Advisor Academic Entry</span>
                <form onSubmit={handleSaveAcademic} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label className="field-label" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                        <Award size={12} color="var(--accent-emerald)" /> CGPA (0.0 - 10.0)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="10"
                        className="field-input"
                        placeholder="e.g. 8.50"
                        value={cgpa}
                        onChange={(e) => setCgpa(e.target.value)}
                        style={{ padding: "6px 10px", fontSize: 12.5 }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="field-label" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                        <Percent size={12} color="var(--accent-cyan)" /> Attendance (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className="field-input"
                        placeholder="e.g. 90.0"
                        value={attendance}
                        onChange={(e) => setAttendance(e.target.value)}
                        style={{ padding: "6px 10px", fontSize: 12.5 }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    {saveSuccess ? (
                      <span style={{ fontSize: 11.5, color: "var(--accent-emerald)" }}>✓ Updated successfully</span>
                    ) : <span />}
                    <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                      <Save size={12} /> {saving ? "Saving…" : "Save CGPA & Attendance"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div>
              <FairnessSlider value={s.fairness ?? 0.2} onChange={() => {}} />
              <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.6 }}>
                How this student's agent should weigh an incomplete task between the student and the reviewing official.
              </p>
              <span className="eyebrow" style={{ marginTop: 10, display: "block" }}>Friend link</span>
              <div style={{ marginTop: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <Link2 size={14} color={s.friend ? "var(--accent-cyan)" : "var(--text-faint)"} />
                {s.friend ? `Linked with ${s.friend}` : "No linked friend"}
              </div>
              {(s.tasks_total ?? 0) > 0 && (
                <div style={{ marginTop: 14 }}>
                  <span className="eyebrow">Tasks</span>
                  <div style={{ marginTop: 8 }}>
                    <ProgressBar value={s.tasks_done ?? 0} max={s.tasks_total} />
                    <div style={{ fontSize: 11.5, color: "var(--text-lo)", marginTop: 5 }}>{s.tasks_done ?? 0} of {s.tasks_total} complete</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdvisorStudents() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showAvailable, setShowAvailable] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([listAdvisorStudents(), listUnassignedStudents()])
      .then(([mine, pool]) => {
        setStudents(mine);
        setAvailable(pool);
      })
      .catch((err) => setError(err.message || "Failed to load students."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async (s) => {
    setBusyId(s.id);
    setError(null);
    try {
      await addStudentToClass(s.id);
      setAvailable((a) => a.filter((x) => x.id !== s.id));
      setStudents((cur) => [{ ...s, class_advisor_id: user.id, dept: user.dept }, ...cur]);
    } catch (err) {
      setError(err.message || "Failed to add student to class.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (s) => {
    setBusyId(s.id);
    setError(null);
    try {
      await removeStudentFromClass(s.id);
      setStudents((cur) => cur.filter((x) => x.id !== s.id));
      setAvailable((a) => [{ ...s, class_advisor_id: null }, ...a]);
    } catch (err) {
      setError(err.message || "Failed to remove student from class.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveAcademic = async (studentId, { cgpa, attendance }) => {
    try {
      const updated = await updateStudentAcademic(studentId, { cgpa, attendance });
      setStudents((cur) => cur.map((x) => (x.id === studentId ? { ...x, cgpa: updated.cgpa, attendance: updated.attendance } : x)));
    } catch (err) {
      setError(err.message || "Failed to update academic records.");
      throw err;
    }
  };

  return (
    <AppShell title="Students & Academic Records" subtitle={loading ? "Loading…" : `${students.length} student${students.length === 1 ? "" : "s"} in your class — manage roster, CGPA & attendance`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, maxWidth: 540, lineHeight: 1.6 }}>
          Class Advisors can manually enter and update CGPA & Attendance for students in their class. Expand a student's row to enter academic records.
        </p>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAvailable((v) => !v)}>
            <UserPlus size={14} /> {showAvailable ? "Hide" : "Add student"} {available.length > 0 && `(${available.length})`}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>
      )}

      {showAvailable && (
        <GlassCard style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={14} color="var(--accent-blue)" />
            <span className="eyebrow">Registered students not yet in a class{user?.dept ? ` · ${user.dept}` : ""}</span>
          </div>
          {!loading && available.length === 0 && (
            <p style={{ padding: "16px 20px", fontSize: 12.5, color: "var(--text-faint)" }}>
              No unassigned students right now — everyone registered in your department already has a class.
            </p>
          )}
          {available.map((s) => (
            <StudentRow
              key={s.id}
              s={s}
              expanded={expanded === `avail-${s.id}`}
              onToggle={() => setExpanded((e) => (e === `avail-${s.id}` ? null : `avail-${s.id}`))}
              actionLabel="Add"
              actionIcon={UserPlus}
              onAction={handleAdd}
              actionBusy={busyId === s.id}
            />
          ))}
        </GlassCard>
      )}

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        {loading && <div style={{ padding: 24, fontSize: 13, color: "var(--text-lo)" }}>Loading students…</div>}
        {!loading && students.length === 0 && (
          <p style={{ padding: "16px 20px", fontSize: 12.5, color: "var(--text-faint)" }}>
            No students in your class yet — click "Add student" above to pick from registered students.
          </p>
        )}
        {students.map((s) => (
          <StudentRow
            key={s.id}
            s={s}
            expanded={expanded === s.id}
            onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
            actionLabel="Remove"
            actionIcon={UserMinus}
            onAction={handleRemove}
            actionBusy={busyId === s.id}
            actionTone="danger"
            onSaveAcademic={handleSaveAcademic}
          />
        ))}
      </GlassCard>
    </AppShell>
  );
}
