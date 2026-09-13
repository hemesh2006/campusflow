import { useState, useMemo } from "react";
import { Send, QrCode, KeyRound, CheckCircle2 } from "lucide-react";
import { GlassCard } from "./Primitives";

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function TelegramConnect({ compact = false }) {
  const [mode, setMode] = useState("idle"); // idle | linking | linked
  const [tab, setTab] = useState("qr"); // qr | code
  const [enteredCode, setEnteredCode] = useState("");
  const linkCode = useMemo(() => genCode(), []);

  const confirm = () => setMode("linked");

  return (
    <GlassCard style={{ padding: compact ? 16 : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(20,184,196,0.12)", color: "var(--accent-cyan)" }}>
          <Send size={15} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>Telegram notifications</div>
          <div style={{ fontSize: 12, color: "var(--text-lo)" }}>Optional — get agent updates on Telegram</div>
        </div>
      </div>

      {mode === "linked" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: "var(--accent-emerald)", fontSize: 13.5 }}>
          <CheckCircle2 size={16} /> Telegram linked
        </div>
      ) : mode === "linking" ? (
        <div style={{ marginTop: 14 }}>
          <div className="auth-tab-switch" style={{ marginBottom: 14 }}>
            <div className={`auth-tab ${tab === "qr" ? "auth-tab-active" : ""}`} onClick={() => setTab("qr")}>Scan QR</div>
            <div className={`auth-tab ${tab === "code" ? "auth-tab-active" : ""}`} onClick={() => setTab("code")}>Enter code</div>
          </div>

          {tab === "qr" ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  width: 92, height: 92, borderRadius: 12, background: "repeating-conic-gradient(#0b1120 0% 25%, #1a2340 0% 50%) 0 0/16px 16px",
                  border: "1px solid var(--glass-border)", flexShrink: 0,
                }}
                aria-label="Demo QR code placeholder"
              />
              <p style={{ fontSize: 12.5, color: "var(--text-mid)", flex: 1, minWidth: 160, margin: 0 }}>
                Open Telegram → CampusFlow bot → scan this code from the chat's
                attach menu to link automatically.
              </p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 12.5, color: "var(--text-mid)", margin: "0 0 10px" }}>
                Send <b style={{ fontFamily: "var(--font-mono)", color: "var(--text-hi)" }}>/link {linkCode}</b> to
                the CampusFlow bot on Telegram, then confirm here.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="field-input"
                  placeholder={`e.g. ${linkCode}`}
                  value={enteredCode}
                  onChange={(e) => setEnteredCode(e.target.value)}
                />
                <button className="btn btn-primary btn-sm" onClick={confirm}>
                  <KeyRound size={13} /> Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setMode("linking")}>
          <QrCode size={14} /> Connect Telegram
        </button>
      )}
    </GlassCard>
  );
}
