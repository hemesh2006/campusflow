export function GlassCard({ children, className = "", style = {}, as: Tag = "div", ...rest }) {
  return (
    <Tag className={`glass ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  );
}

const VIVID_GRADIENTS = {
  emerald: "linear-gradient(135deg, #1fbf8f, #0e8f6c)",
  amber: "linear-gradient(135deg, #f5a94e, #e07a2c)",
  blue: "linear-gradient(135deg, #3b6cf6, #2447c9)",
  violet: "linear-gradient(135deg, #8b6bff, #5c3fd8)",
  rose: "linear-gradient(135deg, #ef6f8e, #c94469)",
  cyan: "linear-gradient(135deg, #2fd7e6, #1a9db3)",
};

export function StatCard({ icon: Icon, label, value, sub, accent = "var(--accent-blue)", variant = "glass", tone = "blue" }) {
  if (variant === "vivid") {
    return (
      <div
        className="stat-card-vivid"
        style={{ background: VIVID_GRADIENTS[tone] || VIVID_GRADIENTS.blue }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {Icon && (
            <div className="stat-card-vivid-icon"><Icon size={16} strokeWidth={2} /></div>
          )}
        </div>
        <div className="h-display" style={{ fontSize: 26, marginTop: 14, color: "#fff" }}>{value}</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.18)" }}>
            {sub}
          </div>
        )}
      </div>
    );
  }
  return (
    <GlassCard className="stat-card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span className="eyebrow">{label}</span>
        {Icon && (
          <div
            style={{
              width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
              background: `${accent}1a`, color: accent,
            }}
          >
            <Icon size={15} strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="h-display" style={{ fontSize: 26 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--text-lo)", marginTop: 4 }}>{sub}</div>}
    </GlassCard>
  );
}

export function RoleBadge({ role, meta }) {
  const m = meta[role];
  return (
    <span className="pill" style={{ borderColor: `${m.color}40`, color: m.color }}>
      <span className="dot" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function StatusDot({ status }) {
  const map = {
    running: { color: "var(--accent-emerald)", label: "Running" },
    idle: { color: "var(--text-lo)", label: "Idle" },
    error: { color: "var(--accent-rose)", label: "Error" },
    warn: { color: "var(--accent-amber)", label: "Attention" },
  };
  const m = map[status] || map.idle;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-mid)" }}>
      <span className={status === "running" ? "dot pulse" : "dot"} style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function ProgressBar({ value, max = 100, color = "var(--accent-blue)", height = 6 }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%", width: `${pct}%`, borderRadius: 999,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(4,7,15,0.6)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass"
        style={{ width: "100%", maxWidth: width, padding: 26, background: "var(--bg-2)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h3 className="h-display" style={{ fontSize: 18, margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
