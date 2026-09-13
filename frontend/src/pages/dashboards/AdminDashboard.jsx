import { useState, useEffect } from "react";
import { Bot, Gauge, ShieldAlert, Cpu } from "lucide-react";
import { Link } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, StatusDot, ProgressBar } from "../../components/common/Primitives";
import { StatStrip } from "../../components/common/StatRing";
import { api } from "../../api/client";

// Every stat and list on this page now comes from real data (the live
// /agents endpoint). There is no event-log or hallucination-history
// backend yet, so — rather than showing invented numbers — this page
// shows an honest "not built yet" note in that spot instead of mock
// data. See info.md "Still open" for what a real version would need
// (an actual event pipeline).

export default function AdminDashboard() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/agents")
      .then((data) => { if (!cancelled) setAgents(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load agents."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const running = agents.filter((a) => a.status === "running").length;
  const idle = agents.filter((a) => a.status === "idle").length;
  const avgAcc = agents.length ? Math.round(agents.reduce((s, a) => s + (a.accuracy || 0), 0) / agents.length) : 0;
  const avgHalluc = agents.length ? (agents.reduce((s, a) => s + (a.hallucination || 0), 0) / agents.length) : 0;

  return (
    <AppShell title="System overview" subtitle="Full institutional access">
      {error && <div style={{ marginBottom: 14, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>}

      <div style={{ marginBottom: 18 }}>
        <StatStrip
          items={[
            { icon: Bot, label: "Nodes running", value: running, sub: agents.length ? `${idle} idle · ${agents.length} total` : "no agents yet", percent: agents.length ? (running / agents.length) * 100 : 0, tone: "var(--accent-emerald)" },
            { icon: Gauge, label: "Avg. accuracy", value: agents.length ? `${avgAcc}%` : "—", sub: agents.length ? "across all agents" : "no agents yet", percent: avgAcc, tone: "var(--accent-blue)" },
            { icon: ShieldAlert, label: "Avg. hallucination", value: agents.length ? `${avgHalluc.toFixed(1)}%` : "—", sub: agents.length ? "across all agents" : "no agents yet", percent: avgHalluc * 8, tone: "var(--accent-rose)" },
          ]}
        />
      </div>

      <div className="grid grid-main-side">
        <GlassCard style={{ padding: 20 }}>
          <span className="eyebrow">Hallucination by agent — live</span>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 13 }}>
            {loading && <p style={{ fontSize: 12.5, color: "var(--text-lo)" }}>Loading agents…</p>}
            {!loading && agents.length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
                No agents registered yet — create one from <Link to="/admin/agent-manager" style={{ color: "var(--accent-blue)" }}>Agent manager</Link>.
              </p>
            )}
            {agents.map((a) => (
              <div key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                  <span>{a.name}</span>
                  <span style={{ color: (a.hallucination || 0) > 3 ? "var(--accent-rose)" : "var(--text-lo)", fontFamily: "var(--font-mono)" }}>
                    {(a.hallucination || 0).toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={a.hallucination || 0} max={10} color={(a.hallucination || 0) > 3 ? "var(--accent-rose)" : "var(--accent-cyan)"} height={5} />
              </div>
            ))}
          </div>
        </GlassCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Cpu size={15} color="var(--text-faint)" />
              <span className="eyebrow">System event log</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.7 }}>
              Not built yet — there's no real event pipeline recording agent
              actions over time, so nothing is shown here rather than
              inventing entries. See <Link to="/admin/agent-manager" style={{ color: "var(--accent-blue)" }}>Agent manager</Link> for live status instead.
            </p>
          </GlassCard>

          <GlassCard style={{ padding: 20 }}>
            <span className="eyebrow">All agents</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 11 }}>
              {!loading && agents.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No agents yet.</p>}
              {agents.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{a.owner_name || "System"}</div>
                  </div>
                  <StatusDot status={a.status} />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
