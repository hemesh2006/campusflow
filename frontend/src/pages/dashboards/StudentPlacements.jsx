import { useEffect, useState } from "react";
import { Briefcase, ChevronDown, ChevronUp, Check, Circle, CheckCircle2 } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import { listPlacements, toggleTask, completePlacement } from "../../api/placements";
import { listMessages } from "../../api/messages";

const STATUS_META = {
  action_needed: { label: "Action needed", color: "var(--accent-rose)" },
  applied: { label: "Applied", color: "var(--accent-amber)" },
  closed: { label: "Closed", color: "var(--text-lo)" },
};

const COMPANY_TONES = {
  "Zoho Corp": "linear-gradient(135deg, #e2506f, #b23a54)",
  "TCS": "linear-gradient(135deg, #2f5deb, #1f3fb0)",
  "Cognizant": "linear-gradient(135deg, #17b487, #0e8f6c)",
};

function CompanyCard({ drive, onToggleTask, onCompleteAction }) {
  const [open, setOpen] = useState(drive.status === "action_needed");
  const [updates, setUpdates] = useState(null);
  const [completing, setCompleting] = useState(false);
  const done = drive.tasks.filter((t) => t.done).length;
  const status = STATUS_META[drive.status] || STATUS_META.action_needed;

  const handleComplete = async (e) => {
    e.stopPropagation();
    if (drive.completed || completing) return;
    setCompleting(true);
    try {
      await onCompleteAction(drive);
    } finally {
      setCompleting(false);
    }
  };

  useEffect(() => {
    if (!open || updates !== null) return;
    listMessages(`placement-${drive.id}`)
      .then((data) => setUpdates(data))
      .catch(() => setUpdates([]));
  }, [open, updates, drive.id]);

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
          {drive.company[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{drive.company}</div>
          <div style={{ fontSize: 12, color: "var(--text-lo)" }}>{drive.role} · {drive.package}</div>
        </div>
        <span className="pill desktop-only" style={{ color: status.color, borderColor: `${status.color}40` }}>{status.label}</span>
        {drive.completed && (
          <span className="pill" style={{ color: "var(--accent-emerald)", borderColor: "var(--accent-emerald)40", display: "flex", alignItems: "center", gap: 5 }}>
            <CheckCircle2 size={12} /> Completed
          </span>
        )}
        {open ? <ChevronUp size={16} color="var(--text-lo)" /> : <ChevronDown size={16} color="var(--text-lo)" />}
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px 74px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-lo)", marginBottom: 6 }}>
              <span>{drive.deadline}</span>
              <span>{done}/{drive.tasks.length} tasks complete</span>
            </div>
            <ProgressBar value={done} max={drive.tasks.length} color={status.color === "var(--text-lo)" ? "var(--text-lo)" : "var(--accent-blue)"} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span className="eyebrow">Tasks</span>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {drive.tasks.map((t, i) => (
                <button
                  key={i}
                  onClick={() => onToggleTask(drive, i, !t.done)}
                  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                >
                  {t.done ? <Check size={14} color="var(--accent-emerald)" /> : <Circle size={14} color="var(--text-faint)" />}
                  <span style={{ color: t.done ? "var(--text-lo)" : "var(--text-hi)", textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <button
              onClick={handleComplete}
              disabled={drive.completed || completing}
              className="btn btn-sm"
              style={{
                background: drive.completed ? "rgba(23,180,135,0.12)" : "var(--accent-emerald)",
                color: drive.completed ? "var(--accent-emerald)" : "#fff",
                border: drive.completed ? "1px solid rgba(23,180,135,0.3)" : "none",
                cursor: drive.completed || completing ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 7,
              }}
            >
              <CheckCircle2 size={14} />
              {drive.completed
                ? `Completed action logged${drive.completed_at ? ` · ${new Date(drive.completed_at).toLocaleString()}` : ""}`
                : completing ? "Saving…" : "Completed Action"}
            </button>
            {!drive.completed && (
              <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "6px 0 0" }}>
                Marks every task above as done and notifies your class advisor that you've finished this drive.
              </p>
            )}
          </div>

          <div>
            <span className="eyebrow">Updates for this company</span>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              {updates === null && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>}
              {updates?.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No updates yet.</p>}
              {updates?.map((m) => (
                <div key={m.id} style={{ fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--accent-blue)", fontWeight: 500 }}>{m.from_name}</span>
                    <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                      {new Date(m.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ margin: "3px 0 0", color: "var(--text-mid)" }}>{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

export default function StudentPlacements() {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listPlacements()
      .then((data) => { if (!cancelled) setDrives(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load placements."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const onToggleTask = async (drive, index, done) => {
    const prev = drives;
    setDrives((ds) => ds.map((d) => d.id === drive.id
      ? { ...d, tasks: d.tasks.map((t, i) => (i === index ? { ...t, done } : t)) }
      : d));
    try {
      await toggleTask(drive.id, index, done);
    } catch (err) {
      setDrives(prev);
      setError(err.message || "Failed to update task.");
    }
  };

  const onCompleteAction = async (drive) => {
    const prev = drives;
    try {
      const updated = await completePlacement(drive.id);
      setDrives((ds) => ds.map((d) => (d.id === drive.id ? updated : d)));
    } catch (err) {
      setDrives(prev);
      setError(err.message || "Failed to save completed action.");
    }
  };

  if (loading) {
    return (
      <AppShell title="Placements" subtitle="Each company kept separate — no mixed message feed">
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading placements…</p>
      </AppShell>
    );
  }

  if (error && drives.length === 0) {
    return (
      <AppShell title="Placements" subtitle="Each company kept separate — no mixed message feed">
        <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>
      </AppShell>
    );
  }

  const open = drives.filter((d) => d.status !== "closed");
  const closed = drives.filter((d) => d.status === "closed");

  return (
    <AppShell title="Placements" subtitle="Each company kept separate — no mixed message feed">
      {drives.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>No placement drives yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <Briefcase size={15} color="var(--accent-blue-soft)" />
            <span className="eyebrow">Open drives ({open.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 26 }}>
            {open.map((d) => <CompanyCard key={d.id} drive={d} onToggleTask={onToggleTask} onCompleteAction={onCompleteAction} />)}
          </div>

          {closed.length > 0 && (
            <>
              <span className="eyebrow">Closed</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
                {closed.map((d) => <CompanyCard key={d.id} drive={d} onToggleTask={onToggleTask} onCompleteAction={onCompleteAction} />)}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
