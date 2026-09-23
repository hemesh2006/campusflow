import { useMemo, useState } from "react";

const ROLE_COLOR = {
  student: "#3b6cf6",
  advisor: "#f5b84e",
  hod: "#37d3a3",
  system: "#8b6bff",
};

const ROLE_LABEL = {
  student: "Student",
  advisor: "Advisor",
  hod: "HOD",
  system: "System",
};

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function layoutNodes(agents, width, height) {
  const hub = agents.find((a) => a.name === "Agent Manager") || agents[0];
  const rest = agents.filter((a) => a.id !== hub.id);
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) / 2 - 84;
  const rand = seededRand(42);

  const positioned = { [hub.id]: { ...hub, x: cx, y: cy, r: 30 } };
  const angleStep = (Math.PI * 2) / rest.length;

  rest.forEach((a, i) => {
    const jitter = (rand() - 0.5) * 0.5;
    const angle = i * angleStep + jitter;
    const radiusJitter = 0.68 + rand() * 0.34;
    const r = baseRadius * radiusJitter;
    positioned[a.id] = {
      ...a,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      r: a.role === "system" ? 24 : 21,
    };
  });

  return positioned;
}

// Curved, non-linear connector between two bubbles — offset control
// point gives it the organic "synapse" look instead of a straight wire.
function curvedPath(a, b, curveSeed) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bend = (dist * 0.18) * (curveSeed % 2 === 0 ? 1 : -1) * (0.5 + (curveSeed % 5) / 8);
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

const STATUS_LABEL = { running: "Running", idle: "Idle" };

function AgentTooltip({ node, x, y }) {
  if (!node) return null;
  const color = ROLE_COLOR[node.role] || "var(--accent-blue)";
  return (
    <div
      style={{
        position: "fixed",
        left: x + 16,
        top: y + 16,
        zIndex: 200,
        pointerEvents: "none",
        minWidth: 200,
        maxWidth: 240,
        background: "#fff",
        border: "1px solid var(--glass-border)",
        borderRadius: 12,
        boxShadow: "0 16px 32px -12px rgba(16,24,40,0.28)",
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-hi)" }}>{node.name}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-lo)", marginBottom: 2 }}>
        {node.owner_name || "System"} · {STATUS_LABEL[node.status] || node.status}
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-mid)", marginTop: 8 }}>
        <span>Accuracy <b style={{ color: "var(--text-hi)" }}>{node.accuracy}%</b></span>
        <span>Halluc. <b style={{ color: node.hallucination > 3 ? "var(--accent-rose)" : "var(--text-hi)" }}>{node.hallucination}%</b></span>
      </div>
      <div
        style={{
          marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--glass-border)",
          fontSize: 11, color: node.deadline ? "var(--accent-amber)" : "var(--text-faint)", fontWeight: node.deadline ? 600 : 400,
        }}
      >
        {node.deadline ? `Deadline: ${node.deadline}` : "No upcoming deadline"}
      </div>
    </div>
  );
}

export default function AgentBubbleGraph({ agents, edges, width = 760, height = 520, onSelect, selectedId }) {
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const nodes = useMemo(() => layoutNodes(agents, width, height), [agents, width, height]);
  const hoveredNode = hovered ? nodes[hovered] : null;

  const onNodeEnter = (id) => (e) => {
    setHovered(id);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };
  const onNodeMove = (e) => {
    if (hovered) setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: "block" }}>
        <defs>
          {Object.entries(ROLE_COLOR).map(([role, color]) => (
            <radialGradient key={role} id={`bubble-${role}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.55" />
            </radialGradient>
          ))}
          <filter id="nodeShadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#101828" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* connectors — thicker, non-linear curves with a continuous flowing dash animation */}
        {edges.map(([fromId, toId], i) => {
          const a = nodes[fromId];
          const b = nodes[toId];
          if (!a || !b) return null;
          const bothRunning = a.status === "running" && b.status === "running";
          const path = curvedPath(a, b, i);
          const active = hovered && (hovered === fromId || hovered === toId);
          const baseWidth = bothRunning ? 3.2 : 2.4;
          const width_ = active ? baseWidth + 2.2 : baseWidth;
          const flowDur = active ? "1s" : bothRunning ? "2.2s" : "5.5s";
          return (
            <g key={i}>
              {/* soft static base line so the connection reads clearly even mid-animation */}
              <path
                d={path}
                fill="none"
                stroke={active ? "var(--accent-cyan)" : "rgba(47,93,235,0.16)"}
                strokeWidth={width_}
                strokeLinecap="round"
              />
              {/* animated flowing dashes on top — the "moving" connection effect */}
              <path
                d={path}
                fill="none"
                stroke={active ? "#fff" : bothRunning ? "var(--accent-cyan)" : "rgba(59,108,246,0.55)"}
                strokeWidth={Math.max(1, width_ - 1.4)}
                strokeLinecap="round"
                strokeDasharray="2 9"
                opacity={active ? 0.95 : 0.7}
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-22" dur={flowDur} repeatCount="indefinite" />
              </path>
              {bothRunning && (
                <circle r="3.2" fill="var(--accent-cyan)">
                  <animateMotion dur={`${3 + (i % 4)}s`} repeatCount="indefinite" path={path} />
                </circle>
              )}
            </g>
          );
        })}

        {/* bubbles */}
        {Object.values(nodes).map((n) => {
          const isSelected = selectedId === n.id;
          const isHovered = hovered === n.id;
          const color = ROLE_COLOR[n.role] || "var(--accent-blue)";
          const label = n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name;
          const labelWidth = Math.max(76, Math.min(150, label.length * 7 + 24));
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y}) scale(${isSelected ? 1.12 : isHovered ? 1.06 : 1})`}
              style={{ cursor: "pointer", transition: "transform 180ms ease" }}
              onClick={() => onSelect?.(n.id)}
              onMouseEnter={onNodeEnter(n.id)}
              onMouseMove={onNodeMove}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${n.name}, ${ROLE_LABEL[n.role] || n.role}, ${STATUS_LABEL[n.status] || n.status}`}</title>
              {(isSelected || isHovered) && (
                <circle
                  r={n.r + 9}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeDasharray={isSelected ? "none" : "3 5"}
                  opacity={isSelected ? 0.9 : 0.55}
                />
              )}
              <circle
                r={n.r}
                fill={`url(#bubble-${n.role})`}
                filter="url(#nodeShadow)"
                stroke={isSelected ? "#fff" : color}
                strokeOpacity={isSelected ? 1 : 0.45}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              <circle
                r={Math.max(5, n.r * 0.22)}
                cx={-n.r * 0.28}
                cy={-n.r * 0.3}
                fill="#fff"
                opacity="0.22"
              />
              {n.status === "running" && (
                <circle r={n.r} fill="none" stroke={color} strokeWidth="1.5" opacity="0.6">
                  <animate attributeName="r" values={`${n.r};${n.r + 9};${n.r}`} dur="2.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={n.r * 0.68}
                cy={-n.r * 0.68}
                r="5"
                fill={n.status === "running" ? "#10b981" : "#94a3b8"}
                stroke="#fff"
                strokeWidth="2"
              />
              <rect
                x={-labelWidth / 2}
                y={n.r + 8}
                width={labelWidth}
                height="24"
                rx="12"
                fill="#fff"
                stroke={isSelected ? color : "rgba(15,23,42,0.09)"}
                strokeWidth={isSelected ? 1.5 : 1}
                opacity="0.98"
              />
              <text
                y={n.r + 24}
                textAnchor="middle"
                fontSize="10"
                fontWeight={isSelected ? "700" : "600"}
                fontFamily="Plus Jakarta Sans, sans-serif"
                fill="var(--text-hi)"
                style={{ pointerEvents: "none" }}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <AgentTooltip node={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />
    </div>
  );
}
