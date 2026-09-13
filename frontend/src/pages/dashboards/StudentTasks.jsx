import { useEffect, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import { listTasks, updateTask } from "../../api/tasks";

const COLUMNS = [
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export default function StudentTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listTasks()
      .then((data) => { if (!cancelled) setTasks(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load tasks."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  return (
    <AppShell title="Tasks" subtitle="Assigned and tracked by your personal agents">
      {error && (
        <div style={{ marginBottom: 16, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>
      )}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading tasks…</p>
      ) : tasks.length === 0 && !error ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>No tasks yet — your agents haven't assigned anything.</p>
      ) : (
        <div className="grid grid-3">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <GlassCard key={col.key} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                  <span className="eyebrow">{col.label}</span>
                  <span className="pill">{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.length === 0 && (
                    <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Nothing here.</p>
                  )}
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => advance(t)}
                      className="glass"
                      style={{ padding: 14, background: "rgba(255,255,255,0.02)", textAlign: "left", border: "none", cursor: "pointer", width: "100%", color: "inherit" }}
                      title="Click to advance status"
                    >
                      <div style={{ fontSize: 13.5, marginBottom: 8 }}>{t.title}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-lo)" }}>
                        <span>{t.due}</span>
                        {t.agent && <span style={{ color: "var(--accent-cyan)" }}>{t.agent}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
