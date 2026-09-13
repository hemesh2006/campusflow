import { useState } from "react";

/**
 * Represents how an agent should weigh an unfinished task against the
 * person responsible for it. 0 = benefit of the doubt goes to the
 * person, 1 = the agent treats the person as fully accountable,
 * 0.5 = shared between the person and the reviewing official.
 */
export default function FairnessSlider({ value = 0.3, onChange, readOnly = false, label = "Accountability bias" }) {
  const [local, setLocal] = useState(value);
  const v = onChange ? value : local;

  const set = (n) => {
    setLocal(n);
    onChange?.(n);
  };

  const zoneLabel = v <= 0.2 ? "Favors the person" : v >= 0.8 ? "Favors the record" : "Shared review";
  const zoneColor = v <= 0.2 ? "var(--accent-emerald)" : v >= 0.8 ? "var(--accent-rose)" : "var(--accent-amber)";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-mid)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: zoneColor }}>
          {v.toFixed(1)} · {zoneLabel}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={v}
        disabled={readOnly}
        onChange={(e) => set(parseFloat(e.target.value))}
        style={{
          width: "100%",
          accentColor: zoneColor,
          cursor: readOnly ? "default" : "pointer",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
        <span>0 — fair to person</span>
        <span>0.5 — shared</span>
        <span>1 — fair to record</span>
      </div>
    </div>
  );
}
