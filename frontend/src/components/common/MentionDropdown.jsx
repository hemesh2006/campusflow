import { ROLE_META } from "../../data/mockData";

// Floating @mention suggestion dropdown — shared by the group chat
// compose box and the direct-message compose box. Purely presentational;
// the parent owns trigger-detection and text-splicing.
export default function MentionDropdown({ results, activeIndex, onPick, style }) {
  if (!results.length) return null;
  return (
    <div
      className="glass"
      style={{
        position: "absolute", zIndex: 20, minWidth: 220, maxWidth: 280,
        maxHeight: 220, overflowY: "auto", padding: 4, background: "var(--bg-2, #fff)",
        border: "1px solid var(--glass-border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
        ...style,
      }}
    >
      {results.map((u, i) => {
        const meta = ROLE_META[u.role];
        return (
          <button
            key={u.id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onPick(u); }}
            style={{
              display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 9px",
              background: i === activeIndex ? "rgba(59,108,246,0.1)" : "transparent",
              border: "none", borderRadius: 7, cursor: "pointer", textAlign: "left", color: "inherit",
            }}
          >
            <div className="avatar" style={{ width: 24, height: 24, fontSize: 11, flexShrink: 0 }}>
              {u.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
            </div>
            {meta && (
              <span className="pill" style={{ fontSize: 9.5, color: meta.color, borderColor: `${meta.color}40`, flexShrink: 0 }}>
                {meta.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
