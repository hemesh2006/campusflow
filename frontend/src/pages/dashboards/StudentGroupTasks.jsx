import { useEffect, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import { useAuth } from "../../context/AuthContext";
import {
  listGroupTasks,
  completeGroupTask,
} from "../../api/groupTasks";
import {
  ClipboardList, Upload, MessageSquare, FormInput, CheckCircle2,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Rocket, Briefcase,
} from "lucide-react";

const MODE_META = {
  mark_done: { icon: CheckCircle2, label: "Mark Complete", color: "#10b981" },
  text: { icon: MessageSquare, label: "Text Response", color: "#6366f1" },
  upload: { icon: Upload, label: "Upload Document", color: "#f59e0b" },
  form: { icon: FormInput, label: "Fill Form", color: "#8b5cf6" },
};

const CAT_META = {
  task: { icon: ClipboardList, color: "#6366f1", tint: "rgba(99,102,241,0.1)", label: "Task" },
  drive: { icon: Briefcase, color: "#10b981", tint: "rgba(16,185,129,0.1)", label: "Placement Drive" },
  general: { icon: Rocket, color: "#6b7280", tint: "rgba(107,114,128,0.1)", label: "Info" },
};

function CompletionBadge({ completion }) {
  if (!completion) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, color: "#10b981",
      background: "#f0fdf4", border: "1px solid #6ee7b7",
      borderRadius: 999, padding: "3px 10px",
    }}>
      <CheckCircle2 size={11} /> Completed
    </span>
  );
}

function DueBadge({ due, completed }) {
  if (!due) return <span style={{ fontSize: 11, color: "var(--text-lo)" }}>No deadline set</span>;
  const daysLeft = Math.ceil((new Date(due) - new Date()) / 86400000);
  const overdue = daysLeft < 0 && !completed;
  const urgent = daysLeft >= 0 && daysLeft <= 2 && !completed;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color: overdue ? "#ef4444" : urgent ? "#f59e0b" : "var(--text-lo)",
      display: "flex", alignItems: "center", gap: 3,
    }}>
      <Clock size={11} />
      {overdue ? `Overdue by ${Math.abs(daysLeft)}d` : urgent ? `Due in ${daysLeft}d` : `Due ${due}`}
    </span>
  );
}

function CompletionPanel({ task, onComplete }) {
  const [mode, setMode] = useState(task.completion_modes?.[0] || "mark_done");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await completeGroupTask(task.id, {
        mode,
        text_response: mode === "text" ? text : undefined,
        upload_url: mode === "upload" ? url : undefined,
      });
      setDone(true);
      onComplete();
    } catch (e) {
      setError(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const modes = task.completion_modes || ["mark_done"];

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--glass-border)", paddingTop: 12 }}>
      {/* Mode selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {modes.map((m) => {
          const meta = MODE_META[m] || MODE_META.mark_done;
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${active ? meta.color : "var(--glass-border)"}`,
                background: active ? `${meta.color}15` : "transparent",
                color: active ? meta.color : "var(--text-mid)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <meta.icon size={12} /> {meta.label}
            </button>
          );
        })}
      </div>

      {/* Input area based on mode */}
      {mode === "text" && (
        <textarea
          placeholder="Type your response here…"
          value={text}
          onChange={e => setText(e.target.value)}
          style={{
            width: "100%", minHeight: 80, padding: "8px 10px",
            borderRadius: 8, border: "1px solid var(--glass-border)",
            background: "var(--glass-bg)", color: "var(--text-hi)",
            fontSize: 12.5, resize: "vertical", boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />
      )}
      {mode === "upload" && (
        <input
          type="url"
          placeholder="Paste Google Drive / OneDrive / file link here…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--glass-border)", background: "var(--glass-bg)",
            color: "var(--text-hi)", fontSize: 12.5, boxSizing: "border-box",
          }}
        />
      )}
      {mode === "form" && (
        <div style={{ fontSize: 12, color: "var(--text-lo)", padding: "6px 0" }}>
          Fill the form linked by your advisor and click Mark Complete below.
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{error}</div>}

      <button
        onClick={submit}
        disabled={submitting || done || (mode === "text" && !text.trim()) || (mode === "upload" && !url.trim())}
        style={{
          marginTop: 10, display: "flex", alignItems: "center", gap: 6,
          padding: "8px 18px", borderRadius: 8, border: "none",
          background: done ? "#10b981" : "var(--accent-blue, #6366f1)",
          color: "#fff", fontSize: 12.5, fontWeight: 700,
          cursor: submitting || done ? "default" : "pointer",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        <CheckCircle2 size={13} />
        {done ? "Submitted ✓" : submitting ? "Submitting…" : "Submit & Mark Complete"}
      </button>
    </div>
  );
}

function GroupTaskCard({ task: initialTask }) {
  const [task, setTask] = useState(initialTask);
  const [expanded, setExpanded] = useState(!initialTask.completion);
  const cat = CAT_META[task.category] || CAT_META.task;
  const isCompleted = !!task.completion;

  const refresh = async () => {
    try {
      const { getGroupTask } = await import("../../api/groupTasks");
      const fresh = await getGroupTask(task.id);
      setTask(fresh);
    } catch {}
  };

  return (
    <GlassCard style={{
      padding: 18, border: `1px solid ${isCompleted ? "rgba(16,185,129,0.2)" : "var(--glass-border)"}`,
      background: isCompleted ? "linear-gradient(135deg,#f0fdf4,#fff)" : undefined,
      opacity: isCompleted ? 0.85 : 1,
    }}>
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Category icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cat.tint, color: cat.color,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <cat.icon size={17} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-hi)" }}>{task.title}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: "uppercase",
              color: cat.color, background: cat.tint, padding: "2px 7px", borderRadius: 999,
            }}>{cat.label}</span>
            <CompletionBadge completion={task.completion} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-lo)", marginBottom: 4 }}>{task.description}</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <DueBadge due={task.due} completed={isCompleted} />
            {task.advisor_name && (
              <span style={{ fontSize: 11, color: "var(--text-lo)" }}>By {task.advisor_name}</span>
            )}
            {task.needs_due_date_input && !task.due && (
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                <AlertTriangle size={11} /> Deadline TBD
              </span>
            )}
          </div>
        </div>

        <div style={{ color: "var(--text-lo)", flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Completion panel */}
      {expanded && !isCompleted && task.status === "open" && (
        <CompletionPanel task={task} onComplete={refresh} />
      )}

      {/* Already completed */}
      {expanded && isCompleted && task.completion && (
        <div style={{
          marginTop: 12, borderTop: "1px solid var(--glass-border)", paddingTop: 10,
          fontSize: 12, color: "var(--text-lo)",
        }}>
          <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <CheckCircle2 size={13} /> Completed via {task.completion.mode?.replace("_", " ")}
          </div>
          {task.completion.text_response && (
            <div style={{ background: "rgba(0,0,0,0.04)", borderRadius: 6, padding: "6px 10px", marginTop: 4 }}>
              "{task.completion.text_response}"
            </div>
          )}
          {task.completion.upload_url && (
            <a href={task.completion.upload_url} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent-blue)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Upload size={12} /> View uploaded document
            </a>
          )}
          <div style={{ marginTop: 4, fontSize: 11 }}>
            {task.completion.completed_at && new Date(task.completion.completed_at).toLocaleString()}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

export default function StudentGroupTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | pending | done

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listGroupTasks()
      .then(data => { if (!cancelled) setTasks(data || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const pending = tasks.filter(t => !t.completion && t.status === "open");
  const done = tasks.filter(t => !!t.completion);
  const shown = filter === "pending" ? pending : filter === "done" ? done : tasks;

  return (
    <AppShell
      title="Class Assignments"
      subtitle="Tasks and announcements from your advisor — complete them your way"
    >
      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All", count: tasks.length, color: "#6366f1" },
          { key: "pending", label: "Pending", count: pending.length, color: "#f59e0b" },
          { key: "done", label: "Completed", count: done.length, color: "#10b981" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", borderRadius: 10, border: "1.5px solid",
              borderColor: filter === tab.key ? tab.color : "var(--glass-border)",
              background: filter === tab.key ? `${tab.color}12` : "transparent",
              color: filter === tab.key ? tab.color : "var(--text-mid)",
              cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            <span style={{
              background: filter === tab.key ? tab.color : "var(--glass-border)",
              color: filter === tab.key ? "#fff" : "var(--text-lo)",
              borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "1px 7px",
            }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading assignments…</p>
      ) : shown.length === 0 ? (
        <GlassCard style={{ padding: 24, textAlign: "center", color: "var(--text-lo)", fontSize: 13 }}>
          {filter === "done" ? "No completed tasks yet." : "No assignments yet — your advisor hasn't sent any tasks."}
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map(task => (
            <GroupTaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
