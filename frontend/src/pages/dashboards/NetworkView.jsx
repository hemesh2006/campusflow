import { useEffect, useRef, useState } from "react";
import AppShell from "../../components/layout/AppShell";
import AgentBubbleGraph from "../../components/common/AgentBubbleGraph";
import { GlassCard, StatusDot } from "../../components/common/Primitives";
import { getAgentGraph } from "../../api/agents";
import { NODE_TYPES } from "../../data/mockData";

// How often to re-poll backend/data/agent_graph.json (via GET
// /agents/graph, which rebuilds the file from Mongo on every call).
// generated_at is compared so a poll that finds nothing changed never
// triggers a re-render.
const POLL_MS = 5000;

export default function NetworkView({ scopeLabel }) {
  const [agents, setAgents] = useState([]);
  const [edges, setEdges] = useState([]);
  const [roleGraph, setRoleGraph] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lastGeneratedAt = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const applyGraph = (graph, isFirstLoad) => {
      if (cancelled) return;
      if (graph.generated_at === lastGeneratedAt.current) return; // file hasn't changed — skip
      lastGeneratedAt.current = graph.generated_at;

      const agentList = Object.entries(graph.agents).map(([id, a]) => ({ id, ...a }));
      const edgeSet = new Set();
      const edgeList = [];
      for (const [id, neighbors] of Object.entries(graph.connections)) {
        for (const n of neighbors) {
          const key = [id, n].sort().join("|");
          if (!edgeSet.has(key)) { edgeSet.add(key); edgeList.push([id, n]); }
        }
      }

      setAgents(agentList);
      setEdges(edgeList);
      setRoleGraph(graph.role_graph || {});
      if (isFirstLoad) setSelectedId(agentList.length ? agentList[agentList.length - 1].id : null);
    };

    const poll = (isFirstLoad) =>
      getAgentGraph()
        .then((graph) => applyGraph(graph, isFirstLoad))
        .catch((err) => { if (!cancelled && isFirstLoad) setError(err.message || "Failed to load agent network."); })
        .finally(() => { if (!cancelled && isFirstLoad) setLoading(false); });

    poll(true);
    const interval = setInterval(() => poll(false), POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const selected = agents.find((a) => a.id === selectedId);

  return (
    <AppShell title="Agent network" subtitle={`Live connections — access scoped to ${scopeLabel.toLowerCase()}`}>
      {loading && <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading agent network…</p>}
      {error && <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>}

      {!loading && !error && (
        <div className="grid grid-main-side">
          <GlassCard style={{ padding: 0, overflow: "hidden", height: 480, position: "relative" }}>
            {agents.length === 0 ? (
              <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
                <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No agents in scope yet.</p>
              </div>
            ) : (
              <>
                <AgentBubbleGraph
                  agents={agents}
                  edges={edges}
                  width={760}
                  height={480}
                  onSelect={setSelectedId}
                  selectedId={selectedId}
                />
                <div style={{ position: "absolute", top: 16, left: 16 }} className="pill">
                  {agents.length} agents · tap a node for detail
                </div>
              </>
            )}
          </GlassCard>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {selected && (
              <GlassCard style={{ padding: 18 }}>
                <span className="eyebrow">Selected node</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
                  <StatusDot status={selected.status} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-lo)", marginTop: 2 }}>{selected.owner_name}</div>
                <div style={{ display: "flex", gap: 18, fontSize: 12, marginTop: 14 }}>
                  <span>Accuracy <b style={{ color: "var(--text-hi)" }}>{selected.accuracy}%</b></span>
                  <span>Hallucination <b style={{ color: selected.hallucination > 3 ? "var(--accent-rose)" : "var(--text-hi)" }}>{selected.hallucination}%</b></span>
                </div>
                {selected.deadline && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--glass-border)", fontSize: 12, color: "var(--accent-amber)", fontWeight: 600 }}>
                    Deadline: {selected.deadline}
                  </div>
                )}
              </GlassCard>
            )}

            <GlassCard style={{ padding: 18 }}>
              <span className="eyebrow">Node legend</span>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
                {Object.entries(NODE_TYPES).map(([key, n]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--text-mid)" }}>
                    <span className="dot" style={{ background: n.color, width: 8, height: 8 }} />
                    {n.label}
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard style={{ padding: 18 }}>
              <span className="eyebrow">All agents</span>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 11 }}>
                {agents.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)" }}>None in scope.</p>}
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: "transparent", border: "none", padding: 0, cursor: "pointer",
                      color: "inherit", textAlign: "left",
                      opacity: selectedId === a.id ? 1 : 0.85,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: selectedId === a.id ? 600 : 400 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{a.owner_name}</div>
                    </div>
                    <StatusDot status={a.status} />
                  </button>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </AppShell>
  );
}
