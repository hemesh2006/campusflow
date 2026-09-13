import { GlassCard } from "./Primitives";

/**
 * A single ring stat: donut progress + icon in the centre, value and
 * label beside it. Compact and icon-led rather than a big colour block.
 */
export function StatRing({ icon: Icon, label, value, sub, percent = 70, tone = "var(--accent-blue)" }) {
  const angle = Math.max(0, Math.min(100, percent)) * 3.6;
  return (
    <div className="stat-ring-item">
      <div
        className="stat-ring-donut"
        style={{ background: `conic-gradient(${tone} ${angle}deg, var(--bg-3) 0deg)` }}
      >
        <div className="stat-ring-donut-inner" style={{ color: tone }}>
          {Icon ? <Icon size={16} strokeWidth={2.2} /> : null}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="h-display" style={{ fontSize: 18, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

/**
 * Thin horizontal strip holding several StatRing items — the
 * "different way to show analytics" instead of stacked large boxes.
 */
export function StatStrip({ items }) {
  return (
    <GlassCard style={{ padding: "6px 4px" }}>
      <div className="stat-strip">
        {items.map((it, i) => (
          <div className="stat-strip-cell" key={i}>
            <StatRing {...it} />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
