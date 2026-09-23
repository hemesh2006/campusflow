import { useState, useEffect } from "react";
import { Cpu, MemoryStick, RotateCcw, Sliders, AlertCircle, Brain, RefreshCw } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar, StatusDot } from "../../components/common/Primitives";
import { listAgents, setAgentStatus } from "../../api/agents";
import { getSystemStats } from "../../api/system";
import { getAssistantModels, setAssistantModel } from "../../api/assistant";

function Gauge({ label, percent, tone, icon: Icon, unavailable, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon size={14} color={tone} />
        <span className="eyebrow">{label}</span>
      </div>
      <div className="h-display" style={{ fontSize: 22, marginBottom: 6, color: unavailable ? "var(--text-faint)" : undefined }}>
        {unavailable ? "—" : `${percent}%`}
      </div>
      <ProgressBar value={unavailable ? 0 : percent} color={tone} />
      {sub && <p style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function LimitSlider({ label, hint, value, min, max, color, onChange }) {
  const progress = ((value - min) / (max - min)) * 100;
  const tint = `color-mix(in srgb, ${color} 9%, transparent)`;
  const borderTint = `color-mix(in srgb, ${color} 22%, transparent)`;

  return (
    <div className="limit-row">
      <div className="limit-row-head">
        <div>
          <div className="limit-label">{label}</div>
          <div className="limit-hint">{hint}</div>
        </div>
        <div className="limit-value" style={{ color, borderColor: borderTint, background: tint }}>
          {value}
        </div>
      </div>
      <div className="limit-slider-wrap">
        <input
          className="limit-slider"
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ "--limit-color": color, "--limit-progress": `${progress}%` }}
          aria-label={label}
        />
        <div className="limit-scale" aria-hidden="true">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}

export default function AgentManagerSettings() {
  const [maxAgents, setMaxAgents] = useState(40);
  const [perUserLimit, setPerUserLimit] = useState(4);
  const [perHodLimit, setPerHodLimit] = useState(10);
  const [resetting, setResetting] = useState(false);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  // Assistant model (Ollama) — this is what every user's personal
  // agent chat runs on institution-wide.
  const [models, setModels] = useState([]);
  const [activeModel, setActiveModel] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(null);
  const [savingModel, setSavingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAgents()
      .then((data) => { if (!cancelled) setAgents(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load agents."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Live CPU/GPU workload — poll the real host every 4s so the gauges
  // track actual usage instead of the old hardcoded 62% / 41%.
  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      getSystemStats()
        .then((data) => { if (!cancelled) { setStats(data); setStatsError(null); } })
        .catch((err) => { if (!cancelled) setStatsError(err.message || "Failed to load system stats."); });
    };
    fetchStats();
    const id = setInterval(fetchStats, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const loadModels = () => {
    setModelsLoading(true);
    setModelsError(null);
    getAssistantModels()
      .then((data) => {
        setModels(data.models || []);
        setActiveModel(data.active || "");
        setSelectedModel(data.active || "");
      })
      .catch((err) => setModelsError(err.message || "Failed to reach Ollama."))
      .finally(() => setModelsLoading(false));
  };

  useEffect(() => { loadModels(); }, []);

  const saveModel = async () => {
    if (!selectedModel || selectedModel === activeModel) return;
    setSavingModel(true);
    setModelSaved(false);
    try {
      await setAssistantModel(selectedModel);
      setActiveModel(selectedModel);
      setModelSaved(true);
      setTimeout(() => setModelSaved(false), 2500);
    } catch (err) {
      setModelsError(err.message || "Failed to save model.");
    } finally {
      setSavingModel(false);
    }
  };

  const toggleAgent = async (agent) => {
    const next = agent.status === "running" ? "idle" : "running";
    const prev = agents;
    setAgents((a) => a.map((x) => (x.id === agent.id ? { ...x, status: next } : x)));
    try {
      await setAgentStatus(agent.id, next);
    } catch (err) {
      setAgents(prev);
      setError(err.message || "Failed to update agent status.");
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await Promise.all(agents.filter((a) => a.status === "running").map((a) => setAgentStatus(a.id, "idle")));
      setAgents((a) => a.map((x) => ({ ...x, status: "idle" })));
    } catch (err) {
      setError(err.message || "Failed to reset agents.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <AppShell title="Agent manager" subtitle="Limits, workload and process control for every agent in the system">
      <div className="grid grid-main-side">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 20 }}>
            <div className="limits-heading">
              <Sliders size={15} color="var(--accent-blue)" />
              <div>
                <span className="eyebrow">Global limits</span>
                <p className="limits-subtitle">Guardrails for agent capacity</p>
              </div>
            </div>
            <div className="limits-list">
              <LimitSlider label="Institution-wide capacity" hint="Maximum agents running at once" value={maxAgents} min={10} max={100} color="var(--accent-blue)" onChange={setMaxAgents} />
              <LimitSlider label="Student allocation" hint="Maximum agents assigned to one student" value={perUserLimit} min={1} max={10} color="var(--accent-emerald)" onChange={setPerUserLimit} />
              <LimitSlider label="HOD allocation" hint="Maximum agents one HOD can assign" value={perHodLimit} min={2} max={30} color="var(--accent-violet)" onChange={setPerHodLimit} />
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Brain size={15} color="var(--accent-violet)" />
                <span className="eyebrow">Assistant model (Ollama)</span>
              </div>
              <button className="icon-btn" style={{ margin: 0, width: 28, height: 28 }} onClick={loadModels} title="Refresh model list" disabled={modelsLoading}>
                <RefreshCw size={13} className={modelsLoading ? "pulse" : ""} />
              </button>
            </div>

            <p style={{ fontSize: 11.5, color: "var(--text-lo)", marginBottom: 14, lineHeight: 1.6 }}>
              Every user's personal assistant (the chat bubble bottom-right) runs on this model, served locally via Ollama. Pull models with <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>ollama pull &lt;name&gt;</code>, then refresh.
            </p>

            {modelsLoading && <p style={{ fontSize: 12, color: "var(--text-lo)" }}>Loading models…</p>}

            {modelsError && !modelsLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--accent-rose, #dc2626)", marginBottom: 12 }}>
                <AlertCircle size={13} /> {modelsError}
              </div>
            )}

            {!modelsLoading && !modelsError && models.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No models pulled on this Ollama host yet.</p>
            )}

            {!modelsLoading && models.length > 0 && (
              <>
                <select
                  className="field-input"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ marginBottom: 12 }}
                >
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}{m.name === activeModel ? "  (active)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: "100%" }}
                  onClick={saveModel}
                  disabled={savingModel || selectedModel === activeModel}
                >
                  {savingModel ? "Saving…" : modelSaved ? "Saved ✓" : "Set as active model"}
                </button>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 10 }}>
                  Active now: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-mid)" }}>{activeModel || "none"}</span>
                </p>
              </>
            )}
          </GlassCard>

          <GlassCard style={{ padding: 20 }}>
            <span className="eyebrow">Workload</span>
            {statsError && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 12, color: "var(--accent-rose, #dc2626)" }}>
                <AlertCircle size={13} /> {statsError}
              </div>
            )}
            <div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap" }}>
              <Gauge
                label="CPU"
                percent={stats ? Math.round(stats.cpu_percent) : 0}
                tone="var(--accent-blue)"
                icon={Cpu}
                unavailable={!stats}
                sub={stats ? `${stats.cpu_cores} logical cores` : undefined}
              />
              <Gauge
                label="GPU"
                percent={stats?.gpu_available ? Math.round(stats.gpu_percent) : 0}
                tone="var(--accent-violet)"
                icon={MemoryStick}
                unavailable={!stats || !stats.gpu_available}
                sub={
                  stats && stats.gpu_available
                    ? `${stats.gpu_name} · ${stats.gpu_memory_used_gb}/${stats.gpu_memory_total_gb} GB`
                    : stats ? "No GPU detected on this host" : undefined
                }
              />
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 14 }}>
              {stats ? `Live from the server · RAM ${stats.memory_percent}% (${stats.memory_used_gb}/${stats.memory_total_gb} GB) · refreshes every 4s` : "Connecting to server…"}
            </p>
          </GlassCard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Process list</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 11 }}>
              {loading && <p style={{ fontSize: 12, color: "var(--text-lo)" }}>Loading agents…</p>}
              {error && <p style={{ fontSize: 12, color: "var(--accent-rose, #dc2626)" }}>{error}</p>}
              {!loading && agents.length === 0 && !error && (
                <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No agents registered yet.</p>
              )}
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAgent(a)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left", color: "inherit" }}
                  title="Click to toggle running/idle"
                >
                  <div>
                    <div style={{ fontSize: 12.5 }}>{a.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>pid-{a.id} · {a.owner_name || "System"}</div>
                  </div>
                  <StatusDot status={a.status} />
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Danger zone</span>
            <p style={{ fontSize: 11.5, color: "var(--text-lo)", margin: "8px 0 12px", lineHeight: 1.6 }}>
              Force-stops every running agent and clears their in-memory task
              state. Use only if agents are stuck or misbehaving.
            </p>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "var(--accent-rose)", borderColor: "rgba(226,80,111,0.3)" }} onClick={doReset} disabled={resetting}>
              <RotateCcw size={14} /> {resetting ? "Resetting…" : "Reset all agents"}
            </button>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
