import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Briefcase, ChevronDown, ChevronUp, CheckCircle2, Circle, Users, Plus, Bot } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar, Modal } from "../../components/common/Primitives";
import { listAdvisorPlacementSummary, createPlacement } from "../../api/placements";

const COMPANY_TONES = {
  "Zoho Corp": "linear-gradient(135deg, #e2506f, #b23a54)",
  "TCS": "linear-gradient(135deg, #2f5deb, #1f3fb0)",
  "Cognizant": "linear-gradient(135deg, #17b487, #0e8f6c)",
  "Wipro": "linear-gradient(135deg, #0284c7, #0369a1)",
};

function StudentRow({ s }) {
  const doneCount = s.tasks.filter((t) => t.done).length;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--glass-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {s.completed ? <CheckCircle2 size={15} color="var(--accent-emerald)" /> : <Circle size={15} color="var(--text-faint)" />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.student_name}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{s.student_email}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 11.5, color: s.completed ? "var(--accent-emerald)" : "var(--text-lo)", fontWeight: 600 }}>
            {s.completed ? "Action completed" : `${doneCount}/${s.tasks.length} tasks`}
          </div>
          {s.completed_at && (
            <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
              {new Date(s.completed_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>
      {s.tasks.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 24, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
          {s.tasks.map((t, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: t.done ? "var(--text-lo)" : "var(--text-mid)" }}>
              {t.done ? <CheckCircle2 size={11} color="var(--accent-emerald)" /> : <Circle size={11} color="var(--text-faint)" />}
              {t.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DriveCard({ drive }) {
  const [open, setOpen] = useState(true);
  const pct = drive.total_students ? Math.round((drive.completed_count / drive.total_students) * 100) : 0;

  return (
    <GlassCard style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "18px 20px",
          background: "transparent", border: "none", color: "inherit", cursor: "pointer", textAlign: "left",
        }}
      >
        <div
          className="avatar"
          style={{ width: 40, height: 40, borderRadius: 11, background: COMPANY_TONES[drive.company] || "linear-gradient(135deg, var(--accent-blue), var(--accent-violet))", fontSize: 15 }}
        >
          {drive.company ? drive.company[0] : "D"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{drive.company}</span>
            {drive.package && (
              <span className="pill" style={{ color: "var(--accent-blue)", borderColor: "var(--accent-blue)40", fontSize: 10 }}>
                {drive.package}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-lo)" }}>{drive.role}</div>
        </div>
        <span className="pill desktop-only" style={{ color: "var(--accent-emerald)", borderColor: "var(--accent-emerald)40" }}>
          {drive.completed_count}/{drive.total_students} completed
        </span>
        {open ? <ChevronUp size={16} color="var(--text-lo)" /> : <ChevronDown size={16} color="var(--text-lo)" />}
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px 74px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-lo)", marginBottom: 6 }}>
              <span>Deadline: {drive.deadline || "Open"}</span>
              <span>{pct}% of class done</span>
            </div>
            <ProgressBar value={drive.completed_count} max={drive.total_students} color="var(--accent-emerald)" />
          </div>

          <span className="eyebrow">Students — rounds, test registration &amp; overall progress</span>
          <div style={{ marginTop: 4 }}>
            {drive.students
              .slice()
              .sort((a, b) => Number(b.completed) - Number(a.completed) || a.student_name.localeCompare(b.student_name))
              .map((s) => <StudentRow key={s.student_id} s={s} />)}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ── Create Placement Drive Modal ─────────────────────────────────────────────
function CreatePlacementModal({ onClose, onCreated, initialValues, aiDetectedMessage }) {
  const [form, setForm] = useState({
    company: initialValues?.company || "",
    role: initialValues?.role || "On-campus Drive",
    package: initialValues?.package || "",
    deadline: initialValues?.deadline || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
  });
  const [tasks, setTasks] = useState([
    "Register on company portal",
    "Submit updated resume",
    "Complete online assessment",
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!form.company.trim()) { setError("Company name is required"); return; }
    if (!form.deadline) { setError("Deadline date is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await createPlacement({
        company: form.company.trim(),
        role: form.role.trim() || "On-campus Drive",
        package: form.package.trim() || undefined,
        deadline: form.deadline,
        tasks: tasks.filter(t => t.trim()).map(t => ({ title: t.trim(), done: false })),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message || "Failed to create placement drive");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={aiDetectedMessage ? "Confirm & Announce Drive (AI Detected)" : "Create Placement Drive"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {aiDetectedMessage && (
          <div style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(5,150,105,0.14))",
            border: "1px solid rgba(16,185,129,0.35)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <Bot size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#10b981" }}>
                Auto-Detected by Ollama AI
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-mid)", marginTop: 2 }}>
                From group message: <em>"{aiDetectedMessage}"</em>. Company, package, and drive info extracted. Review and confirm to announce this drive to your class students.
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="field-label">Company Name *</label>
          <input
            className="field-input"
            value={form.company}
            onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
            placeholder="e.g. Wipro, TCS, Zoho Corp, Cognizant"
          />
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <label className="field-label">Role / Drive Type *</label>
            <input
              className="field-input"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="e.g. On-campus Drive, Software Engineer"
            />
          </div>
          <div>
            <label className="field-label">Package / CTC</label>
            <input
              className="field-input"
              value={form.package}
              onChange={e => setForm(f => ({ ...f, package: e.target.value }))}
              placeholder="e.g. 5.6 LPA"
            />
          </div>
        </div>

        <div>
          <label className="field-label">Registration Deadline *</label>
          <input
            type="date"
            className="field-input"
            value={form.deadline}
            onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
          />
        </div>

        <div>
          <label className="field-label">Required student milestone tasks</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {tasks.map((taskText, idx) => (
              <input
                key={idx}
                className="field-input"
                style={{ fontSize: 12 }}
                value={taskText}
                onChange={e => {
                  const newTasks = [...tasks];
                  newTasks[idx] = e.target.value;
                  setTasks(newTasks);
                }}
              />
            ))}
          </div>
        </div>

        {error && <div style={{ fontSize: 11.5, color: "#ef4444" }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <Plus size={13} /> {saving ? "Creating…" : aiDetectedMessage ? "Confirm & Announce Drive" : "Create Placement Drive"}
          </button>
          <button className="btn btn-sm" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--glass-border)" }}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Advisor Placements Main Page ─────────────────────────────────────────────
export default function AdvisorPlacements() {
  const location = useLocation();
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [aiMessage, setAiMessage] = useState(null);

  const load = () => {
    setLoading(true);
    listAdvisorPlacementSummary()
      .then(setDrives)
      .catch((err) => setError(err.message || "Failed to load placement summary."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Listen for prefillDrive passed from group message navigation
  useEffect(() => {
    if (location.state?.prefillDrive) {
      setPrefill(location.state.prefillDrive);
      setAiMessage(location.state.originalMessage || "");
      setCreating(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const totalStudents = drives.length ? Math.max(...drives.map((d) => d.total_students)) : 0;

  return (
    <AppShell title="Placement completion" subtitle="Who's finished each drive, class-wide">
      {/* Top action bar: Summary count + New Placement Drive button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Briefcase size={16} color="var(--accent-blue)" />
          <span className="eyebrow" style={{ fontSize: 12 }}>Active drives ({drives.length})</span>
          {totalStudents > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-faint)", marginLeft: 8 }}>
              <Users size={13} /> {totalStudents} students in scope
            </span>
          )}
        </div>
        <button
          onClick={() => {
            setPrefill(null);
            setAiMessage(null);
            setCreating(true);
          }}
          className="btn btn-primary btn-sm"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={14} /> + New Placement Drive
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading placement summary…</p>
      ) : error && drives.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>
      ) : drives.length === 0 ? (
        <GlassCard style={{ padding: 32, textAlign: "center", color: "var(--text-lo)" }}>
          <Briefcase size={32} style={{ opacity: 0.3, margin: "0 auto 10px" }} />
          <div style={{ fontSize: 13 }}>No placement drives found for your class yet.</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Click "+ New Placement Drive" above or type an announcement in your group chat to detect and announce a drive.
          </div>
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {drives.map((d) => <DriveCard key={`${d.company}__${d.role}`} drive={d} />)}
        </div>
      )}

      {/* Placement Drive Creation & Confirmation Modal */}
      {creating && (
        <CreatePlacementModal
          initialValues={prefill}
          aiDetectedMessage={aiMessage}
          onClose={() => {
            setCreating(false);
            setPrefill(null);
            setAiMessage(null);
          }}
          onCreated={load}
        />
      )}
    </AppShell>
  );
}

