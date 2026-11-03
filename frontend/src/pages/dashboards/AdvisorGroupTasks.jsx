import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, Modal } from "../../components/common/Primitives";
import { useAuth } from "../../context/AuthContext";
import {
  listAdvisorGroupTasks,
  createGroupTask,
  setGroupTaskDue,
  getGroupTaskCompletions,
  deleteGroupTask,
} from "../../api/groupTasks";
import {
  Plus, Clock, CheckCircle2, Users, Upload, MessageSquare,
  AlertTriangle, ChevronDown, ChevronUp, Trash2, CalendarDays,
  ClipboardList, Briefcase, Bot,
} from "lucide-react";

const MODE_LABELS = {
  mark_done: "Mark Done",
  text: "Text",
  upload: "Upload",
  form: "Form",
};

const CAT_META = {
  task: { icon: ClipboardList, color: "#6366f1", label: "Task" },
  drive: { icon: Briefcase, color: "#10b981", label: "Drive" },
  general: { icon: Bot, color: "#6b7280", label: "Info" },
};

// ── Completion detail modal ─────────────────────────────────────────────────
function CompletionsModal({ task, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!task) return;
    setLoading(true);
    getGroupTaskCompletions(task.id)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [task?.id]);

  if (!task) return null;
  const done = data?.completed || [];
  const pending = data?.pending || [];

  return (
    <Modal open={!!task} onClose={onClose} title={`Completion — "${task.title}"`}>
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading…</p>
      ) : (
        <>
          {/* Summary strip */}
          <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
            {[
              { label: "Completed", val: done.length, color: "#10b981" },
              { label: "Pending", val: pending.length, color: "#f59e0b" },
              { label: "Total", val: (data?.total_students || 0), color: "#6366f1" },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, textAlign: "center", padding: "10px 0",
                background: `${s.color}10`, borderRadius: 10, border: `1px solid ${s.color}30`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "var(--text-lo)", fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Completed students */}
          {done.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", marginBottom: 8 }}>
                ✅ Completed ({done.length})
              </div>
              {done.map(s => (
                <div key={s.student_id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8, background: "#f0fdf4",
                  border: "1px solid #bbf7d0", marginBottom: 6,
                }}>
                  <CheckCircle2 size={14} color="#10b981" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.student_name}</div>
                    {s.completion?.text_response && (
                      <div style={{ fontSize: 11, color: "var(--text-lo)", marginTop: 2 }}>
                        💬 "{s.completion.text_response.slice(0, 80)}{s.completion.text_response.length > 80 ? "…" : ""}"
                      </div>
                    )}
                    {s.completion?.upload_url && (
                      <a href={s.completion.upload_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: "var(--accent-blue)", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                        <Upload size={10} /> View document
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-lo)", textAlign: "right" }}>
                    <div style={{ fontWeight: 600 }}>{MODE_LABELS[s.completion?.mode] || s.completion?.mode}</div>
                    <div>{s.completion?.completed_at ? new Date(s.completion.completed_at).toLocaleDateString() : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending students */}
          {pending.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>
                ⏳ Pending ({pending.length})
              </div>
              {pending.map(s => (
                <div key={s.student_id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8, background: "#fffbeb",
                  border: "1px solid #fde68a", marginBottom: 6,
                }}>
                  <Clock size={14} color="#f59e0b" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.student_name}</div>
                    {s.roll_id && <div style={{ fontSize: 11, color: "var(--text-lo)" }}>{s.roll_id}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Set due-date modal ──────────────────────────────────────────────────────
function DueDateModal({ task, onClose, onSaved }) {
  const [due, setDue] = useState(task?.due || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!due) return;
    setSaving(true);
    try {
      await setGroupTaskDue(task.id, due);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!task} onClose={onClose} title="Set Deadline">
      <p style={{ fontSize: 12.5, color: "var(--text-lo)", marginBottom: 12 }}>
        The AI didn't detect a due date in the message. Please set one:
      </p>
      <input
        type="date"
        value={due}
        onChange={e => setDue(e.target.value)}
        className="field-input"
        style={{ marginBottom: 12, width: "100%" }}
      />
      {error && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{error}</div>}
      <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !due}>
        <CalendarDays size={13} /> {saving ? "Saving…" : "Set Deadline"}
      </button>
    </Modal>
  );
}

// ── Create task modal ───────────────────────────────────────────────────────
function CreateTaskModal({ onClose, onCreated, advisorId, initialValues, aiDetectedMessage }) {
  const [form, setForm] = useState({
    title: initialValues?.title || "",
    description: initialValues?.description || "",
    due: initialValues?.due || "",
    category: initialValues?.category || "task",
    completion_modes: initialValues?.completion_modes?.length ? initialValues.completion_modes : ["form", "mark_done"],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toggleMode = (m) => {
    setForm(f => ({
      ...f,
      completion_modes: f.completion_modes.includes(m)
        ? f.completion_modes.filter(x => x !== m)
        : [...f.completion_modes, m],
    }));
  };

  const save = async () => {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    try {
      await createGroupTask({
        ...form,
        group: `class-${advisorId}`,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={aiDetectedMessage ? "Confirm & Broadcast Task (AI Detected)" : "Create Group Task"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {aiDetectedMessage && (
          <div style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(99,102,241,0.14), rgba(168,85,247,0.14))",
            border: "1px solid rgba(99,102,241,0.35)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <Bot size={18} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6366f1" }}>
                Auto-Detected by Ollama AI
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-mid)", marginTop: 2 }}>
                From group message: <em>"{aiDetectedMessage}"</em>. Please review the pre-filled fields below and confirm to broadcast this task to your class students.
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="field-label">Task title *</label>
          <input className="field-input" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Fill the internship Google Form" />
        </div>
        <div>
          <label className="field-label">Description</label>
          <textarea className="field-input" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="More details for students…"
            style={{ minHeight: 60, resize: "vertical" }} />
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <label className="field-label">Category</label>
            <select className="field-input" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="task">Task</option>
              <option value="drive">Placement Drive</option>
              <option value="general">General Info</option>
            </select>
          </div>
          <div>
            <label className="field-label">Deadline</label>
            <input type="date" className="field-input" value={form.due}
              onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="field-label">Completion modes (students can use any selected)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {Object.entries(MODE_LABELS).map(([m, label]) => {
              const active = form.completion_modes.includes(m);
              return (
                <button key={m} onClick={() => toggleMode(m)} style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: "1.5px solid", cursor: "pointer",
                  borderColor: active ? "var(--accent-blue)" : "var(--glass-border)",
                  background: active ? "rgba(99,102,241,0.1)" : "transparent",
                  color: active ? "var(--accent-blue)" : "var(--text-mid)",
                }}>{label}</button>
              );
            })}
          </div>
        </div>
        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <Plus size={13} /> {saving ? "Creating…" : aiDetectedMessage ? "Confirm & Create Task" : "Create Task"}
          </button>
          <button className="btn btn-sm" onClick={onClose}
            style={{ background: "transparent", border: "1px solid var(--glass-border)" }}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Single task row ─────────────────────────────────────────────────────────
function TaskRow({ task, onViewCompletions, onSetDue, onDelete, highlighted, taskRef }) {
  const cat = CAT_META[task.category] || CAT_META.task;
  const pct = task.total_students > 0
    ? Math.round((task.completed_count / task.total_students) * 100) : 0;
  const overdue = task.due && new Date(task.due) < new Date();

  return (
    <GlassCard
      ref={taskRef}
      style={{
        padding: "14px 18px",
        transition: "box-shadow 0.4s ease, border-color 0.4s ease",
        ...(highlighted ? {
          boxShadow: "0 0 0 2px rgba(139,92,246,0.7), 0 4px 24px rgba(139,92,246,0.25)",
          borderColor: "rgba(139,92,246,0.6)",
          animation: "drive-highlight-pulse 1.5s ease 3",
        } : {}),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `${cat.color}15`, color: cat.color,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <cat.icon size={16} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{task.title}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase",
              color: cat.color, background: `${cat.color}15`, padding: "2px 7px", borderRadius: 999,
            }}>{cat.label}</span>
            {task.needs_due_date_input && !task.due && (
              <button onClick={() => onSetDue(task)}
                style={{
                  fontSize: 10, fontWeight: 700, color: "#f59e0b",
                  background: "#fffbeb", border: "1px solid #fde68a",
                  borderRadius: 999, padding: "2px 8px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                <AlertTriangle size={10} /> Set deadline
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: overdue ? "#ef4444" : "var(--text-lo)", display: "flex", alignItems: "center", gap: 3 }}>
              <Clock size={10} />{task.due ? (overdue ? `Overdue: ${task.due}` : task.due) : "No deadline"}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-lo)", display: "flex", alignItems: "center", gap: 3 }}>
              <Users size={10} /> {task.completed_count}/{task.total_students} students done
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: "#e5e7eb", borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%", borderRadius: 999,
              background: pct === 100 ? "#10b981" : pct > 50 ? "#6366f1" : "#f59e0b",
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onViewCompletions(task)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
              color: "var(--accent-blue)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Users size={12} /> View Completions
          </button>
          <button onClick={() => onDelete(task)} title="Delete task"
            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)", color: "#ef4444", cursor: "pointer" }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function AdvisorGroupTasks() {
  const { user } = useAuth();
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completionTask, setCompletionTask] = useState(null);
  const [dueTask, setDueTask] = useState(null);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [aiMessage, setAiMessage] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const taskRefs = useRef({});

  const load = () => {
    setLoading(true);
    listAdvisorGroupTasks()
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (location.state?.prefillTask) {
      setPrefill(location.state.prefillTask);
      setAiMessage(location.state.originalMessage || location.state.prefillTask.description);
      setCreating(true);
      window.history.replaceState({}, document.title);
    }
    if (location.state?.highlightTaskId) {
      setHighlightId(location.state.highlightTaskId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Scroll to highlighted task once tasks have loaded
  useEffect(() => {
    if (highlightId && tasks.length > 0) {
      const el = taskRefs.current[highlightId];
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
        // Clear highlight after animation completes
        setTimeout(() => setHighlightId(null), 5000);
      }
    }
  }, [highlightId, tasks]);

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await deleteGroupTask(task.id);
      load();
    } catch {}
  };

  const needsDue = tasks.filter(t => t.needs_due_date_input && !t.due);
  const open = tasks.filter(t => t.status === "open");
  const totalPending = open.reduce((s, t) => s + (t.pending_count || 0), 0);

  return (
    <AppShell
      title="Group Task Manager"
      subtitle="Broadcast tasks to your class — track who completed what"
    >
      {/* Alert: tasks needing due dates */}
      {needsDue.length > 0 && (
        <div style={{
          marginBottom: 16, padding: "10px 16px", borderRadius: 10,
          background: "#fffbeb", border: "1px solid #fde68a",
          display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
          color: "#92400e", fontWeight: 600,
        }}>
          <AlertTriangle size={14} color="#f59e0b" />
          {needsDue.length} task{needsDue.length > 1 ? "s" : ""} need{needsDue.length === 1 ? "s" : ""} a deadline — click "Set deadline" to add one.
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Open Tasks", val: open.length, color: "#6366f1" },
          { label: "Students Pending", val: totalPending, color: "#f59e0b" },
        ].map(s => (
          <GlassCard key={s.label} style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "var(--text-lo)", fontWeight: 600 }}>{s.label}</div>
          </GlassCard>
        ))}
        <button
          onClick={() => setCreating(true)}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}
        >
          <Plus size={15} /> New Group Task
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <GlassCard style={{ padding: 32, textAlign: "center", color: "var(--text-lo)" }}>
          <ClipboardList size={32} style={{ opacity: 0.3, margin: "0 auto 10px" }} />
          <div style={{ fontSize: 13 }}>No group tasks yet.</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            Send a message to your class group — the AI will auto-detect tasks and create them here.
          </div>
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onViewCompletions={setCompletionTask}
              onSetDue={setDueTask}
              onDelete={handleDelete}
              highlighted={highlightId === t.id}
              taskRef={(el) => { taskRefs.current[t.id] = el; }}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <CompletionsModal task={completionTask} onClose={() => setCompletionTask(null)} />
      {dueTask && (
        <DueDateModal task={dueTask} onClose={() => setDueTask(null)} onSaved={load} />
      )}
      {creating && (
        <CreateTaskModal
          advisorId={user?.id}
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
