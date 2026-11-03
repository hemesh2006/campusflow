import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2, Calendar, Bot, Check, Clock, ChevronRight } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, Modal } from "../../components/common/Primitives";
import { listTasks, createTask, updateTask, deleteTask, decomposeTask } from "../../api/tasks";

const COLUMNS = [
  { key: "pending", label: "Pending", color: "var(--accent-amber)" },
  { key: "in_progress", label: "In progress", color: "var(--accent-blue)" },
  { key: "done", label: "Done", color: "var(--accent-emerald)" },
];

export default function StudentTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [decomposingId, setDecomposingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const fetchTasks = () => {
    setLoading(true);
    listTasks()
      .then((data) => setTasks(data))
      .catch((err) => setError(err.message || "Failed to load tasks."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const advance = async (task) => {
    const next = task.status === "pending" ? "in_progress" : task.status === "in_progress" ? "done" : "pending";
    const prev = tasks;
    setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, status: next } : x)));
    try {
      await updateTask(task.id, { status: next });
    } catch (err) {
      setTasks(prev);
      setError(err.message || "Failed to update task.");
    }
  };

  const handleDecompose = async (e, task) => {
    e.stopPropagation();
    if (decomposingId) return;
    setDecomposingId(task.id);
    try {
      const created = await decomposeTask(task.id);
      if (Array.isArray(created) && created.length > 0) {
        setTasks((prev) => [...created, ...prev]);
        showToast(`✨ Autonomous Agent decomposed "${task.title.slice(0, 24)}…" into ${created.length} actionable subtasks!`);
      }
    } catch (err) {
      setError(err.message || "Failed to decompose task.");
    } finally {
      setDecomposingId(null);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTask(id);
    } catch {
      fetchTasks();
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createTask({
        title: newTitle.trim(),
        due: newDue || new Date().toISOString().split("T")[0],
        agent: "Personal Task",
      });
      setTasks((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewTitle("");
      setNewDue("");
      showToast("Task added successfully.");
    } catch (err) {
      setError(err.message || "Failed to create task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Tasks"
      subtitle="Autonomous AI task tracking, group tasks, and LLM decomposition"
      action={
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={14} /> New Task
        </button>
      }
    >
      {toastMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.15))",
            border: "1px solid rgba(99,102,241,0.4)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: "#fff",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <Sparkles size={16} color="var(--accent-violet)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading tasks…</p>
      ) : tasks.length === 0 && !error ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <Bot size={36} color="var(--text-faint)" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, color: "var(--text-lo)", fontWeight: 600 }}>No tasks currently in your backlog.</p>
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
            Click "+ New Task" above or ask your personal AI assistant to plan tasks around upcoming deadlines.
          </p>
        </div>
      ) : (
        <div className="grid grid-3" style={{ gap: 16, alignItems: "start" }}>
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <GlassCard key={col.key} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: col.color,
                        boxShadow: `0 0 8px ${col.color}`,
                      }}
                    />
                    <span className="eyebrow" style={{ fontSize: 11 }}>{col.label}</span>
                  </div>
                  <span className="pill" style={{ fontSize: 10 }}>{items.length}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "12px 4px" }}>No tasks in this lane.</p>
                  )}
                  {items.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => advance(t)}
                      className="glass"
                      style={{
                        padding: "13px 14px",
                        background: "rgba(255,255,255,0.03)",
                        textAlign: "left",
                        border: "1px solid var(--glass-border)",
                        borderRadius: 10,
                        cursor: "pointer",
                        width: "100%",
                        color: "inherit",
                        transition: "transform 0.15s ease, border-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.borderColor = "var(--glass-border)";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, flex: 1 }}>{t.title}</div>
                        {!t.is_group_task && (
                          <button
                            onClick={(e) => handleDelete(e, t.id)}
                            title="Delete Task"
                            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", padding: 2 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-lo)", marginTop: 10 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)" }}>
                          <Clock size={11} /> {t.due}
                        </span>
                        {t.agent && (
                          <span style={{ color: t.is_group_task ? "var(--accent-violet)" : "var(--accent-cyan)", fontSize: 10.5, fontWeight: 600 }}>
                            {t.agent}
                          </span>
                        )}
                      </div>

                      {/* AI Task Decompose Button */}
                      {col.key !== "done" && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <button
                            onClick={(e) => handleDecompose(e, t)}
                            disabled={decomposingId === t.id}
                            style={{
                              background: "rgba(139,92,246,0.12)",
                              border: "1px solid rgba(139,92,246,0.35)",
                              borderRadius: 6,
                              padding: "3px 8px",
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: "var(--accent-violet)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Sparkles size={11} />
                            {decomposingId === t.id ? "Decomposing…" : "AI Decompose"}
                          </button>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 2 }}>
                            Advance <ChevronRight size={10} />
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <Modal title="Create New Task" open onClose={() => setShowAddModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="field-label">Task Title *</label>
              <input
                className="field-input"
                placeholder="e.g. Prepare for Technical Interview Round 1"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">Target Deadline</label>
              <input
                type="date"
                className="field-input"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreate}
                disabled={saving || !newTitle.trim()}
              >
                {saving ? "Creating…" : "Create Task"}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setShowAddModal(false)}
                style={{ background: "transparent", border: "1px solid var(--glass-border)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
