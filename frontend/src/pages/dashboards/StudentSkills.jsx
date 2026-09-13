import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import { api } from "../../api/client";

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 26 - ((v - min) / (max - min || 1)) * 26;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 26" width="100%" height="30" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SkillRow({ s, tone }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--glass-border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 4px",
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: "inherit",
        }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${tone}18`, color: tone, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <TrendingUp size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>{s.skill}</span>
            <span style={{ color: s.level < 60 ? "var(--accent-amber)" : "var(--text-mid)" }}>{s.level}%</span>
          </div>
          <ProgressBar value={s.level} color={s.level < 60 ? "var(--accent-amber)" : tone} />
        </div>
        {open ? <ChevronUp size={16} color="var(--text-lo)" /> : <ChevronDown size={16} color="var(--text-lo)" />}
      </button>

      {open && (s.topics?.length > 0 || s.trend?.length > 0) && (
        <div style={{ padding: "0 4px 20px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
          {s.topics?.length > 0 && (
            <div>
              <span className="eyebrow">Topic breakdown</span>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {s.topics.map((t) => (
                  <div key={t.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "var(--text-mid)" }}>{t.name}</span>
                      <span style={{ color: "var(--text-lo)" }}>{t.score}%</span>
                    </div>
                    <ProgressBar value={t.score} color={tone} height={4} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {s.trend?.length > 1 && (
            <div>
              <span className="eyebrow">Daily improvement — last 7 days</span>
              <div style={{ marginTop: 8 }}>
                <Sparkline data={s.trend} color={tone} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                {s.trend[0]}% → {s.trend.at(-1)}% this week
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TONES = ["var(--accent-blue)", "var(--accent-emerald)", "var(--accent-amber)", "var(--accent-violet)", "var(--accent-cyan)"];

export default function StudentSkills() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/skills/me")
      .then((data) => { if (!cancelled) setSkills(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load skills."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const weak = skills.filter((s) => s.level < 60).map((s) => s.skill);

  return (
    <AppShell title="Skills" subtitle="Tap a subject for its assessment breakdown and daily trend">
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading skills…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error}</p>
      ) : skills.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>No skill assessments yet.</p>
      ) : (
        <>
          <GlassCard style={{ padding: "8px 20px", maxWidth: 620 }}>
            {skills.map((s, i) => (
              <SkillRow key={s.id} s={s} tone={TONES[i % TONES.length]} />
            ))}
          </GlassCard>
          {weak.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-lo)", marginTop: 14, maxWidth: 620, lineHeight: 1.6 }}>
              {weak.join(" and ")} {weak.length > 1 ? "are" : "is"} below target — your Skill Assist Agent has queued a
              focused drill plan in today's schedule.
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}
