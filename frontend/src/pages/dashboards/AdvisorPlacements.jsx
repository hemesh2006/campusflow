import { useEffect, useState } from "react";
import { Briefcase, ChevronDown, ChevronUp, CheckCircle2, Circle, Users } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import { listAdvisorPlacementSummary } from "../../api/placements";

const COMPANY_TONES = {
  "Zoho Corp": "linear-gradient(135deg, #e2506f, #b23a54)",
  "TCS": "linear-gradient(135deg, #2f5deb, #1f3fb0)",
  "Cognizant": "linear-gradient(135deg, #17b487, #0e8f6c)",
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
          {drive.company[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{drive.company}</div>
          <div style={{ fontSize: 12, color: "var(--text-lo)" }}>{drive.role}{drive.package ? ` · ${drive.package}` : ""}</div>
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
              <span>{drive.deadline}</span>
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

export default function AdvisorPlacements() {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listAdvisorPlacementSummary()
      .then((data) => { if (!cancelled) setDrives(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load placement summary."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalStudents = drives.length ? Math.max(...drives.map((d) => d.total_students)) : 0;

  if (loading) {
    return (
      <AppShell title="Placement completion" subtitle="Who's finished each drive, class-wide">
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading placement summary…</p>
      </AppShell>
    );
  }

  if (error && drives.length === 0) {
    return (
      <AppShell title="Placement completion" subtitle="Who's finished each drive, class-wide">
        <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Placement completion" subtitle="Who's finished each drive, class-wide">
      {drives.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>No placement drives found for your class yet.</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <Briefcase size={15} color="var(--accent-blue-soft)" />
            <span className="eyebrow">Active drives ({drives.length})</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto", fontSize: 11.5, color: "var(--text-faint)" }}>
              <Users size={13} /> {totalStudents} student{totalStudents === 1 ? "" : "s"} in scope
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {drives.map((d) => <DriveCard key={`${d.company}__${d.role}`} drive={d} />)}
          </div>
        </>
      )}
    </AppShell>
  );
}
