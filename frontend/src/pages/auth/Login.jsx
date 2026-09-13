import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Eye, EyeOff, AlertCircle, Wrench, X } from "lucide-react";
import GradientBlobs from "../../components/common/GradientBlobs";
import WorkflowIllustration from "../../components/common/WorkflowIllustration";
import { GlassCard } from "../../components/common/Primitives";
import { useAuth } from "../../context/AuthContext";
import { roleHome } from "../../routes";
import { listDevUsers } from "../../api/dev";

const ROLE_ORDER = ["admin", "principal", "hod", "advisor", "student"];
const ROLE_LABEL = { admin: "Admin", principal: "Principal", hod: "HOD", advisor: "Advisor", student: "Student" };

// Hardcoded build stamp — bump this by hand whenever a change is pushed,
// so it's obvious on the login screen that the latest update is live.
const LAST_UPDATED = "24 Aug 2026, 6:40 PM";

// Dev-only bypass panel — pick any seeded user by role/name and log in
// with no password. Silently does nothing if the backend's DEV_MODE
// is off (listDevUsers/devLogin will 403, panel just shows an error).
function DevBypassPanel({ onClose }) {
  const { devLogin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listDevUsers()
      .then((data) => { if (!cancelled) setUsers(data); })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err.status === 403
            ? "Dev bypass is disabled on the backend. Set DEV_MODE=true in backend/.env and restart the server."
            : err.message || "Failed to load dev users."
        );
      });
    return () => { cancelled = true; };
  }, []);

  const pick = async (u) => {
    setBusyId(u.id);
    setError(null);
    try {
      const user = await devLogin(u.id);
      navigate(roleHome(user.role));
    } catch (err) {
      setError(err.message || "Bypass login failed.");
      setBusyId(null);
    }
  };

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    items: (users || []).filter((u) => u.role === role),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "grid",
      placeItems: "center", zIndex: 50, padding: 20,
    }}>
      <GlassCard style={{ width: "min(460px, 100%)", maxHeight: "80vh", overflow: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wrench size={16} color="var(--accent-amber)" />
            <span style={{ fontSize: 15, fontWeight: 700 }}>Developer bypass</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-lo)" }} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "4px 0 16px", lineHeight: 1.5 }}>
          Local testing only — signs in as any seeded account with no password.
          Requires <code>DEV_MODE=true</code> in the backend's <code>.env</code>. Never enable this in production.
        </p>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 14,
            borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "var(--accent-rose, #dc2626)", fontSize: 12,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {!users && !error && <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading users…</p>}

        {users && grouped.length === 0 && !error && (
          <p style={{ fontSize: 13, color: "var(--text-lo)" }}>No seeded users found — run <code>python -m app.seed</code> in the backend.</p>
        )}

        {grouped.map((g) => (
          <div key={g.role} style={{ marginBottom: 14 }}>
            <span className="eyebrow">{ROLE_LABEL[g.role] || g.role}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {g.items.map((u) => (
                <button
                  key={u.id}
                  onClick={() => pick(u)}
                  disabled={busyId !== null}
                  className="glass"
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                    padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "none",
                    borderRadius: 10, cursor: busyId ? "default" : "pointer", textAlign: "left", color: "inherit",
                    opacity: busyId && busyId !== u.id ? 0.5 : 1,
                  }}
                >
                  <span>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{u.email}</div>
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--accent-blue)", fontWeight: 600 }}>
                    {busyId === u.id ? "Signing in…" : "Use this"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </GlassCard>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const user = await login({ email, password });
      navigate(roleHome(user.role));
    } catch (err) {
      setError(err.status === 401 ? "Incorrect email or password." : err.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-visual">
        <GradientBlobs className="auth-visual-graph" />
        <div className="auth-visual-content">
          <div className="brand-mark" style={{ marginBottom: 20 }}><Sparkles size={16} /></div>
          <h2 className="h-display" style={{ fontSize: 30, lineHeight: 1.2, margin: "0 0 12px" }}>
            One campus.<br />Every task, coordinated.
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            Every student, advisor and department has a <span className="auth-visual-accent">personal assistant</span>.
            CampusFlow breaks down compound requests into clear task lists
            and keeps everyone accountable — without another portal to check.
          </p>
        </div>
        <div className="auth-visual-illustration"><WorkflowIllustration /></div>
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 22, fontSize: 12, color: "var(--text-lo)" }}>
          <span>Automated task planning</span>
          <span>·</span>
          <span>Deadline tracking</span>
          <span>·</span>
          <span>Role-scoped access</span>
        </div>
      </section>

      <section className="auth-form-side">
        <GlassCard className="auth-card">
          <div className="auth-tab-switch">
            <div className="auth-tab auth-tab-active">Sign in</div>
            <Link to="/signup" style={{ flex: 1 }}>
              <div className="auth-tab">Create account</div>
            </Link>
          </div>

          <h1 className="h-display" style={{ fontSize: 22, margin: "0 0 4px" }}>Welcome back</h1>
          <p style={{ fontSize: 13, color: "var(--text-lo)", margin: "0 0 24px" }}>
            Sign in with your college email. Your role is assigned by the backend.
          </p>

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 16,
              borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "var(--accent-rose, #dc2626)", fontSize: 12.5,
            }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="email">College email</label>
              <input
                id="email" type="email" required className="field-input"
                placeholder="you@campusflow.edu" value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="field-label" htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="password" type={showPw ? "text" : "password"} required
                  className="field-input" placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button" onClick={() => setShowPw((s) => !s)}
                  style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", color: "var(--text-lo)", cursor: "pointer" }}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"} {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowDevPanel(true)}
            className="btn btn-ghost btn-sm"
            style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Wrench size={13} /> Developer bypass — skip login
          </button>

          <div className="demo-strip">
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: 0, lineHeight: 1.6 }}>
              Only one account exists out of the box: <code>admin@campusflow.edu</code> (password <code>password123</code>).
              Every other account — student, advisor, HOD, principal — is created for real via <b>Create account</b> above.
            </p>
          </div>

          <div style={{ textAlign: "center", marginTop: 14 }}>
            <span className="pill" style={{ fontSize: 10.5, color: "var(--text-faint)", borderColor: "var(--glass-border)" }}>
              Updated: {LAST_UPDATED}
            </span>
          </div>
        </GlassCard>
      </section>

      {showDevPanel && <DevBypassPanel onClose={() => setShowDevPanel(false)} />}
    </div>
  );
}
