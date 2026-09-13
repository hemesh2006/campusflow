import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import GradientBlobs from "../../components/common/GradientBlobs";
import WorkflowIllustration from "../../components/common/WorkflowIllustration";
import { GlassCard } from "../../components/common/Primitives";
import { useAuth } from "../../context/AuthContext";
import { roleHome } from "../../routes";

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setLoading(true);
    setError(null);
    try {
      const user = await signup(form);
      navigate(roleHome(user.role));
    } catch (err) {
      setError(err.status === 409 ? "An account with this email already exists." : err.message || "Sign up failed.");
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
            Your access level<br />finds you automatically.
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            No role picker, no waiting on approval emails. CampusFlow reads your
            institutional identity and provisions the right dashboard, <span className="auth-visual-accent">assistant</span>
            and permissions the moment you sign up.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, fontSize: 12.5, color: "var(--accent-emerald)" }}>
            <ShieldCheck size={15} /> Access is scoped the moment you're verified
          </div>
        </div>
        <div className="auth-visual-illustration"><WorkflowIllustration /></div>
      </section>

      <section className="auth-form-side">
        <GlassCard className="auth-card">
          <div className="auth-tab-switch">
            <Link to="/login" style={{ flex: 1 }}>
              <div className="auth-tab">Sign in</div>
            </Link>
            <div className="auth-tab auth-tab-active">Create account</div>
          </div>

          <h1 className="h-display" style={{ fontSize: 22, margin: "0 0 4px" }}>Join CampusFlow</h1>
          <p style={{ fontSize: 13, color: "var(--text-lo)", margin: "0 0 24px" }}>
            Use your college email — your role and department access are
            assigned for you by institutional heads.
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
              <label className="field-label" htmlFor="name">Full name</label>
              <input id="name" required className="field-input" placeholder="Your name" value={form.name} onChange={update("name")} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="s-email">College email</label>
              <input id="s-email" type="email" required className="field-input" placeholder="you@campusflow.edu" value={form.email} onChange={update("email")} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="field-label" htmlFor="s-password">Password</label>
              <input id="s-password" type="password" required className="field-input" placeholder="Create a password" value={form.password} onChange={update("password")} />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Creating account…" : "Create account"} {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 18, lineHeight: 1.6 }}>
            By continuing you agree to your institution's code of conduct —
            including respectful communication in shared and agent-mediated
            channels.
          </p>
        </GlassCard>
      </section>
    </div>
  );
}
