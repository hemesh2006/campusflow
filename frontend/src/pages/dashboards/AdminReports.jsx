import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, Modal } from "../../components/common/Primitives";
import { listReports, updateReportStatus } from "../../api/reports";

const STATUS_COLOR = {
  open: "var(--accent-rose)",
  investigating: "var(--accent-amber)",
  resolved: "var(--accent-emerald)",
};

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const [working, setWorking] = useState(false);

  const refresh = () => {
    setLoading(true);
    return listReports()
      .then(setReports)
      .catch((err) => setError(err.message || "Failed to load reports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const applyStatus = async (statusValue) => {
    if (!active) return;
    setWorking(true);
    try {
      const updated = await updateReportStatus(active.id, statusValue);
      setReports((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      setActive(updated);
    } catch (err) {
      setError(err.message || "Failed to update report.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppShell title="Reports & help" subtitle="Escalations filed by students, advisors and HODs">
      {loading && <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading reports…</p>}
      {error && <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>}

      {!loading && (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          {reports.length === 0 && (
            <p style={{ padding: "18px 20px", fontSize: 12.5, color: "var(--text-faint)" }}>No reports filed yet.</p>
          )}
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              style={{
                width: "100%", textAlign: "left", background: "transparent", border: "none", color: "inherit", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: "1px solid var(--glass-border)",
              }}
            >
              <LifeBuoy size={16} color="var(--text-lo)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{r.subject}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-lo)" }}>
                  {r.from_name}{r.from_dept ? ` · ${r.from_dept}` : ""} · {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              <span className="pill" style={{ color: STATUS_COLOR[r.status], borderColor: `${STATUS_COLOR[r.status]}40` }}>
                {r.status}
              </span>
            </button>
          ))}
        </GlassCard>
      )}

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.subject || ""}>
        {active && (
          <div>
            <p style={{ fontSize: 12.5, color: "var(--text-lo)", marginBottom: 16 }}>
              Reported by {active.from_name}{active.from_dept ? ` · ${active.from_dept}` : ""} · {new Date(active.created_at).toLocaleString()}
            </p>
            {active.body && (
              <p style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 20 }}>{active.body}</p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={working || active.status === "investigating"} onClick={() => applyStatus("investigating")}>
                {working ? "Working…" : "Forward to HOD"}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={working || active.status === "resolved"} onClick={() => applyStatus("resolved")}>
                {working ? "Working…" : "Mark resolved"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
