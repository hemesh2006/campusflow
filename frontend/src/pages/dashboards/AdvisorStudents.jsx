import { useState, useEffect, useCallback, useMemo } from "react";
import {
  UserPlus, UserMinus, ChevronDown, ChevronUp, Link2, Users, RefreshCw,
  Save, Award, Percent, Calendar, CheckCircle2, XCircle, AlertTriangle,
  Clock, Bell, Search, Filter, Sparkles, Check
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import FairnessSlider from "../../components/common/FairnessSlider";
import {
  listAdvisorStudents,
  listUnassignedStudents,
  addStudentToClass,
  removeStudentFromClass,
  updateStudentAcademic,
  getDailyAttendance,
  submitDailyAttendance,
  sendAttendanceWarning,
} from "../../api/users";
import { useAuth } from "../../context/AuthContext";

function AttendanceBadge({ attendance }) {
  if (attendance == null) {
    return <span style={{ fontSize: 12, color: "var(--text-lo)" }}>—</span>;
  }
  const isDanger = attendance < 75;
  const isWarning = attendance >= 75 && attendance < 85;

  const bg = isDanger
    ? "rgba(239, 68, 68, 0.15)"
    : isWarning
    ? "rgba(245, 158, 11, 0.15)"
    : "rgba(16, 185, 129, 0.15)";
  const color = isDanger
    ? "var(--accent-rose, #ef4444)"
    : isWarning
    ? "var(--accent-amber, #f59e0b)"
    : "var(--accent-emerald, #10b981)";
  const border = isDanger
    ? "1px solid rgba(239, 68, 68, 0.3)"
    : isWarning
    ? "1px solid rgba(245, 158, 11, 0.3)"
    : "1px solid rgba(16, 185, 129, 0.3)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 20,
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        background: bg,
        color: color,
        border: border,
      }}
    >
      {isDanger && <AlertTriangle size={11} />}
      {attendance}%
    </span>
  );
}

function StudentRow({
  s,
  expanded,
  onToggle,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  actionBusy,
  actionTone = "primary",
  onSaveAcademic,
  onSendWarning,
}) {
  const [cgpa, setCgpa] = useState(s.cgpa ?? "");
  const [attendance, setAttendance] = useState(s.attendance ?? "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [warningBusy, setWarningBusy] = useState(false);
  const [warningSent, setWarningSent] = useState(false);

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

  const handleWarningClick = async () => {
    if (!onSendWarning) return;
    setWarningBusy(true);
    try {
      await onSendWarning(s.id);
      setWarningSent(true);
      setTimeout(() => setWarningSent(false), 3000);
    } finally {
      setWarningBusy(false);
    }
  };

  const isShortage = s.attendance != null && s.attendance < 75;

  return (
    <div style={{ borderBottom: "1px solid var(--glass-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
            padding: 0,
          }}
        >
          <div
            className="avatar"
            style={{
              background: isShortage
                ? "linear-gradient(135deg, var(--accent-rose), #991b1b)"
                : "linear-gradient(135deg, var(--accent-amber), var(--accent-rose))",
            }}
          >
            {s.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              {isShortage && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(239, 68, 68, 0.2)",
                    color: "var(--accent-rose)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  Shortage
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-lo)" }}>
              {s.email}
              {s.dept ? ` · ${s.dept}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginRight: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>CGPA</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: s.cgpa ? "var(--accent-emerald)" : "var(--text-lo)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.cgpa != null ? s.cgpa.toFixed(2) : "—"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase" }}>Attendance</div>
              <AttendanceBadge attendance={s.attendance} />
            </div>
          </div>

          {expanded ? <ChevronUp size={16} color="var(--text-lo)" /> : <ChevronDown size={16} color="var(--text-lo)" />}
        </button>

        {isShortage && onSendWarning && (
          <button
            onClick={handleWarningClick}
            disabled={warningBusy || warningSent}
            className="btn btn-sm"
            title="Dispatch official attendance warning to student's DM"
            style={{
              flexShrink: 0,
              background: warningSent ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: warningSent ? "var(--accent-emerald)" : "var(--accent-rose)",
              border: `1px solid ${warningSent ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              fontSize: 11.5,
              padding: "6px 10px",
            }}
          >
            {warningSent ? (
              <>
                <Check size={12} /> Warning Sent
              </>
            ) : (
              <>
                <Bell size={12} /> {warningBusy ? "Sending…" : "Warn Student"}
              </>
            )}
          </button>
        )}

        {onAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction(s);
            }}
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
              <div
                style={{
                  background: "var(--glass-bg)",
                  padding: 16,
                  borderRadius: 12,
                  border: "1px solid var(--glass-border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Sparkles size={12} color="var(--accent-blue)" /> Class Advisor Records
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Manual Overrides</span>
                </div>
                <form onSubmit={handleSaveAcademic} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                        style={{ padding: "7px 10px", fontSize: 12.5 }}
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
                        style={{ padding: "7px 10px", fontSize: 12.5 }}
                      />
                    </div>
                  </div>

                  {/* Attendance Quick Modifier Chips */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>Quick Adj:</span>
                    {[
                      { label: "+1%", delta: 1 },
                      { label: "+5%", delta: 5 },
                      { label: "-1%", delta: -1 },
                      { label: "-5%", delta: -5 },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          const cur = attendance !== "" ? parseFloat(attendance) : 80;
                          const next = Math.max(0, Math.min(100, Math.round((cur + chip.delta) * 10) / 10));
                          setAttendance(next);
                        }}
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 10.5,
                          color: chip.delta > 0 ? "var(--accent-emerald)" : "var(--accent-rose)",
                          cursor: "pointer",
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    {saveSuccess ? (
                      <span style={{ fontSize: 11.5, color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Check size={12} /> Saved successfully
                      </span>
                    ) : <span />}
                    <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                      <Save size={12} /> {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div>
              <FairnessSlider value={s.fairness ?? 0.2} onChange={() => {}} />
              <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.6 }}>
                How this student's agent weighs incomplete tasks between the student and academic reviewers.
              </p>
              <span className="eyebrow" style={{ marginTop: 10, display: "block" }}>Peer Link</span>
              <div style={{ marginTop: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <Link2 size={14} color={s.friend ? "var(--accent-cyan)" : "var(--text-faint)"} />
                {s.friend ? `Linked with ${s.friend}` : "No linked peer"}
              </div>
              {(s.tasks_total ?? 0) > 0 && (
                <div style={{ marginTop: 14 }}>
                  <span className="eyebrow">Assigned Workflows</span>
                  <div style={{ marginTop: 8 }}>
                    <ProgressBar value={s.tasks_done ?? 0} max={s.tasks_total} />
                    <div style={{ fontSize: 11.5, color: "var(--text-lo)", marginTop: 5 }}>
                      {s.tasks_done ?? 0} of {s.tasks_total} tasks resolved
                    </div>
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
  const [activeTab, setActiveTab] = useState("rollcall"); // 'rollcall' | 'roster' | 'available'
  const [students, setStudents] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Daily Attendance Roll Call State
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyStatusMap, setDailyStatusMap] = useState({}); // { [studentId]: 'present' | 'absent' | 'od' }
  const [rollCallLoaded, setRollCallLoaded] = useState(false);
  const [savingRollCall, setSavingRollCall] = useState(false);
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'shortage' | 'safe'
  const [searchQuery, setSearchQuery] = useState("");

  const showToast = (msg, tone = "success") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3500);
  };

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

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load attendance record whenever selectedDate changes
  useEffect(() => {
    let cancelled = false;
    setRollCallLoaded(false);
    getDailyAttendance(selectedDate)
      .then((res) => {
        if (cancelled) return;
        const map = {};
        if (res && res.records && res.records.length > 0) {
          res.records.forEach((r) => {
            map[r.student_id] = r.status;
          });
        } else {
          // Default all currently registered class students to "present"
          students.forEach((s) => {
            map[s.id] = "present";
          });
        }
        setDailyStatusMap(map);
        setRollCallLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        const map = {};
        students.forEach((s) => {
          map[s.id] = "present";
        });
        setDailyStatusMap(map);
        setRollCallLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, students]);

  // Class Analytics
  const analytics = useMemo(() => {
    const total = students.length;
    if (total === 0) return { total: 0, avg: 0, shortages: 0, good: 0 };
    const valid = students.filter((s) => s.attendance != null);
    const sum = valid.reduce((acc, s) => acc + s.attendance, 0);
    const avg = valid.length > 0 ? Math.round((sum / valid.length) * 10) / 10 : 0;
    const shortages = students.filter((s) => s.attendance != null && s.attendance < 75).length;
    const good = students.filter((s) => s.attendance != null && s.attendance >= 85).length;
    return { total, avg, shortages, good };
  }, [students]);

  // Daily Roll Call Counters
  const rollCallCounters = useMemo(() => {
    let present = 0;
    let absent = 0;
    let od = 0;
    students.forEach((s) => {
      const st = dailyStatusMap[s.id] || "present";
      if (st === "present") present++;
      else if (st === "absent") absent++;
      else if (st === "od") od++;
    });
    const total = students.length;
    const rate = total > 0 ? Math.round(((present + od) / total) * 100) : 0;
    return { present, absent, od, total, rate };
  }, [students, dailyStatusMap]);

  // Quick batch status setters
  const setAllStatus = (status) => {
    const next = {};
    students.forEach((s) => {
      next[s.id] = status;
    });
    setDailyStatusMap(next);
  };

  const handleSaveDailyAttendance = async () => {
    if (students.length === 0) return;
    setSavingRollCall(true);
    setError(null);
    try {
      const records = students.map((s) => ({
        student_id: s.id,
        status: dailyStatusMap[s.id] || "present",
      }));
      await submitDailyAttendance({ date: selectedDate, records });
      showToast(`Daily attendance for ${selectedDate} finalized successfully!`);
      // Refresh students to reflect newly calculated cumulative attendance percentages
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to record daily attendance.");
    } finally {
      setSavingRollCall(false);
    }
  };

  const handleSendWarning = async (studentId) => {
    try {
      await sendAttendanceWarning(studentId);
      showToast("Official attendance shortage alert dispatched to student!", "warning");
    } catch (err) {
      setError(err.message || "Could not dispatch shortage warning.");
      throw err;
    }
  };

  const handleAdd = async (s) => {
    setBusyId(s.id);
    setError(null);
    try {
      await addStudentToClass(s.id);
      setAvailable((a) => a.filter((x) => x.id !== s.id));
      setStudents((cur) => [{ ...s, class_advisor_id: user.id, dept: user.dept }, ...cur]);
      showToast(`${s.name} added to your class roster!`);
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
      showToast(`${s.name} removed from your class.`);
    } catch (err) {
      setError(err.message || "Failed to remove student from class.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveAcademic = async (studentId, { cgpa, attendance }) => {
    try {
      const updated = await updateStudentAcademic(studentId, { cgpa, attendance });
      setStudents((cur) =>
        cur.map((x) =>
          x.id === studentId ? { ...x, cgpa: updated.cgpa, attendance: updated.attendance } : x
        )
      );
      showToast("Academic records updated!");
    } catch (err) {
      setError(err.message || "Failed to update academic records.");
      throw err;
    }
  };

  // Filtered Students for Roster tab
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name?.toLowerCase().includes(q);
        const matchesEmail = s.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      if (filterMode === "shortage") {
        return s.attendance != null && s.attendance < 75;
      }
      if (filterMode === "safe") {
        return s.attendance != null && s.attendance >= 75;
      }
      return true;
    });
  }, [students, searchQuery, filterMode]);

  return (
    <AppShell
      title="Class Attendance & Student Management"
      subtitle={
        loading
          ? "Synchronizing class records…"
          : `${students.length} student${students.length === 1 ? "" : "s"} in class — daily roll call & academic governance`
      }
    >
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            background: toast.tone === "warning" ? "#d97706" : "#059669",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <CheckCircle2 size={16} /> {toast.msg}
        </div>
      )}

      {/* Top Analytics Cards */}
      <div className="grid grid-4" style={{ gap: 14, marginBottom: 20 }}>
        <GlassCard style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-lo)" }}>Class Enrolled</span>
            <Users size={16} color="var(--accent-blue)" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, fontFamily: "var(--font-mono)" }}>
            {analytics.total}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Registered Students</div>
        </GlassCard>

        <GlassCard style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-lo)" }}>Avg Attendance</span>
            <Percent size={16} color="var(--accent-cyan)" />
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
              fontFamily: "var(--font-mono)",
              color: analytics.avg >= 75 ? "var(--accent-emerald)" : "var(--accent-rose)",
            }}
          >
            {analytics.avg}%
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Institutional Target: 75%</div>
        </GlassCard>

        <GlassCard style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-lo)" }}>Critical Shortage</span>
            <AlertTriangle size={16} color="var(--accent-rose)" />
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 6,
              fontFamily: "var(--font-mono)",
              color: analytics.shortages > 0 ? "var(--accent-rose)" : "var(--text-hi)",
            }}
          >
            {analytics.shortages}
          </div>
          <div style={{ fontSize: 11, color: "var(--accent-rose)", marginTop: 4 }}>
            {analytics.shortages > 0 ? "Action required (< 75%)" : "All students compliant"}
          </div>
        </GlassCard>

        <GlassCard style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-lo)" }}>Exemplary (&gt;85%)</span>
            <Award size={16} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, fontFamily: "var(--font-mono)", color: "var(--accent-emerald)" }}>
            {analytics.good}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Placement Qualified</div>
        </GlassCard>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, background: "rgba(255, 255, 255, 0.04)", padding: 4, borderRadius: 10, border: "1px solid var(--glass-border)" }}>
          <button
            onClick={() => setActiveTab("rollcall")}
            style={{
              background: activeTab === "rollcall" ? "var(--accent-blue)" : "transparent",
              color: activeTab === "rollcall" ? "#fff" : "var(--text-lo)",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Calendar size={13} /> Daily Roll Call
          </button>
          <button
            onClick={() => setActiveTab("roster")}
            style={{
              background: activeTab === "roster" ? "var(--accent-blue)" : "transparent",
              color: activeTab === "roster" ? "#fff" : "var(--text-lo)",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Users size={13} /> Student Roster ({students.length})
          </button>
          <button
            onClick={() => setActiveTab("available")}
            style={{
              background: activeTab === "available" ? "var(--accent-blue)" : "transparent",
              color: activeTab === "available" ? "#fff" : "var(--text-lo)",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <UserPlus size={13} /> Add Students {available.length > 0 && `(${available.length})`}
          </button>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={13} /> Refresh Data
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(239, 68, 68, 0.12)",
            color: "var(--accent-rose)",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* ────────────────── TAB 1: DAILY ROLL CALL ────────────────── */}
      {activeTab === "rollcall" && (
        <div>
          {/* Controls Bar */}
          <GlassCard style={{ padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
              {/* Date Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Calendar size={16} color="var(--accent-cyan)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Attendance Date:</span>
                <input
                  type="date"
                  className="field-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ padding: "6px 12px", fontSize: 12.5, width: 160 }}
                />
              </div>

              {/* Counters Pill Strip */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-emerald)" }} />
                  <span>Present: <strong>{rollCallCounters.present}</strong></span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-rose)" }} />
                  <span>Absent: <strong>{rollCallCounters.absent}</strong></span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-cyan)" }} />
                  <span>OD: <strong>{rollCallCounters.od}</strong></span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-blue)", paddingLeft: 6, borderLeft: "1px solid var(--glass-border)" }}>
                  Turnout: {rollCallCounters.rate}%
                </div>
              </div>

              {/* Batch Actions & Save */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAllStatus("present")}
                  title="Mark everyone present"
                  style={{ color: "var(--accent-emerald)" }}
                >
                  <CheckCircle2 size={13} /> All Present
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAllStatus("absent")}
                  title="Mark everyone absent"
                  style={{ color: "var(--accent-rose)" }}
                >
                  <XCircle size={13} /> All Absent
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveDailyAttendance}
                  disabled={savingRollCall || students.length === 0}
                  style={{ minWidth: 120 }}
                >
                  <Save size={13} /> {savingRollCall ? "Finalizing…" : "Finalize Today"}
                </button>
              </div>
            </div>
          </GlassCard>

          {/* Student Roll Call Table */}
          <GlassCard style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 220px",
                padding: "12px 20px",
                borderBottom: "1px solid var(--glass-border)",
                fontSize: 11,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              <span>Student Profile</span>
              <span style={{ textAlign: "center" }}>Cumulative Att.</span>
              <span style={{ textAlign: "right" }}>Today's Status</span>
            </div>

            {loading && <div style={{ padding: 24, fontSize: 13, color: "var(--text-lo)" }}>Loading roll call roster…</div>}

            {!loading && students.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-faint)" }}>
                No students in your class yet. Switch to the "Add Students" tab to populate your roster.
              </div>
            )}

            {students.map((s) => {
              const currentStatus = dailyStatusMap[s.id] || "present";
              return (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 140px 220px",
                    alignItems: "center",
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--glass-border)",
                    background: currentStatus === "absent" ? "rgba(239, 68, 68, 0.04)" : "transparent",
                  }}
                >
                  {/* Student details */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      className="avatar avatar-sm"
                      style={{
                        background:
                          currentStatus === "present"
                            ? "linear-gradient(135deg, var(--accent-emerald), #047857)"
                            : currentStatus === "absent"
                            ? "linear-gradient(135deg, var(--accent-rose), #b91c1c)"
                            : "linear-gradient(135deg, var(--accent-cyan), #0369a1)",
                      }}
                    >
                      {s.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-lo)" }}>{s.email}</div>
                    </div>
                  </div>

                  {/* Cumulative percentage */}
                  <div style={{ textAlign: "center" }}>
                    <AttendanceBadge attendance={s.attendance} />
                  </div>

                  {/* 3-Way Status Toggle */}
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setDailyStatusMap((prev) => ({ ...prev, [s.id]: "present" }))}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        border: "1px solid",
                        cursor: "pointer",
                        background: currentStatus === "present" ? "rgba(16, 185, 129, 0.2)" : "transparent",
                        borderColor: currentStatus === "present" ? "var(--accent-emerald)" : "var(--glass-border)",
                        color: currentStatus === "present" ? "var(--accent-emerald)" : "var(--text-lo)",
                      }}
                    >
                      P
                    </button>
                    <button
                      type="button"
                      onClick={() => setDailyStatusMap((prev) => ({ ...prev, [s.id]: "absent" }))}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        border: "1px solid",
                        cursor: "pointer",
                        background: currentStatus === "absent" ? "rgba(239, 68, 68, 0.2)" : "transparent",
                        borderColor: currentStatus === "absent" ? "var(--accent-rose)" : "var(--glass-border)",
                        color: currentStatus === "absent" ? "var(--accent-rose)" : "var(--text-lo)",
                      }}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setDailyStatusMap((prev) => ({ ...prev, [s.id]: "od" }))}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        border: "1px solid",
                        cursor: "pointer",
                        background: currentStatus === "od" ? "rgba(6, 182, 212, 0.2)" : "transparent",
                        borderColor: currentStatus === "od" ? "var(--accent-cyan)" : "var(--glass-border)",
                        color: currentStatus === "od" ? "var(--accent-cyan)" : "var(--text-lo)",
                      }}
                      title="On Duty / Authorized College Leave"
                    >
                      OD
                    </button>
                  </div>
                </div>
              );
            })}
          </GlassCard>
        </div>
      )}

      {/* ────────────────── TAB 2: STUDENT ROSTER & ACADEMIC EDIT ────────────────── */}
      {activeTab === "roster" && (
        <div>
          {/* Search & Filter Bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 240, maxWidth: 400 }}>
              <Search size={14} color="var(--text-lo)" style={{ position: "absolute", left: 12, top: 11 }} />
              <input
                type="text"
                className="field-input"
                placeholder="Search students by name or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 34, fontSize: 12.5 }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Filter size={13} color="var(--text-faint)" />
              <button
                className={`btn btn-sm ${filterMode === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterMode("all")}
                style={{ fontSize: 11.5 }}
              >
                All ({students.length})
              </button>
              <button
                className={`btn btn-sm ${filterMode === "shortage" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterMode("shortage")}
                style={{
                  fontSize: 11.5,
                  color: filterMode === "shortage" ? "#fff" : "var(--accent-rose)",
                  borderColor: "rgba(239, 68, 68, 0.3)",
                }}
              >
                Shortage (&lt;75%) ({analytics.shortages})
              </button>
              <button
                className={`btn btn-sm ${filterMode === "safe" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setFilterMode("safe")}
                style={{ fontSize: 11.5 }}
              >
                Safe (≥75%) ({students.length - analytics.shortages})
              </button>
            </div>
          </div>

          <GlassCard style={{ padding: 0, overflow: "hidden" }}>
            {loading && <div style={{ padding: 24, fontSize: 13, color: "var(--text-lo)" }}>Loading students…</div>}
            {!loading && filteredStudents.length === 0 && (
              <p style={{ padding: "24px 20px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
                No students match the current search or filter.
              </p>
            )}
            {filteredStudents.map((s) => (
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
                onSendWarning={handleSendWarning}
              />
            ))}
          </GlassCard>
        </div>
      )}

      {/* ────────────────── TAB 3: AVAILABLE STUDENTS (UNASSIGNED) ────────────────── */}
      {activeTab === "available" && (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--glass-border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Users size={14} color="var(--accent-blue)" />
            <span className="eyebrow">
              Registered students not yet in a class
              {user?.dept ? ` · ${user.dept}` : ""}
            </span>
          </div>
          {!loading && available.length === 0 && (
            <p style={{ padding: "24px 20px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
              No unassigned students in your department right now — all registered students have an assigned advisor.
            </p>
          )}
          {available.map((s) => (
            <StudentRow
              key={s.id}
              s={s}
              expanded={expanded === `avail-${s.id}`}
              onToggle={() => setExpanded((e) => (e === `avail-${s.id}` ? null : `avail-${s.id}`))}
              actionLabel="Add to Class"
              actionIcon={UserPlus}
              onAction={handleAdd}
              actionBusy={busyId === s.id}
            />
          ))}
        </GlassCard>
      )}
    </AppShell>
  );
}
