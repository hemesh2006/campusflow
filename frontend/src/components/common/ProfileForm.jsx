import { useState, useEffect } from "react";
import { Camera, Save } from "lucide-react";
import { GlassCard } from "./Primitives";

export function ProfilePhoto({ name, size = 76 }) {
  const [preview, setPreview] = useState(null);

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  };

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: "50%", overflow: "hidden",
          background: preview ? undefined : "linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))",
          display: "grid", placeItems: "center", color: "#fff", fontSize: size / 2.6, fontWeight: 700,
        }}
      >
        {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name?.[0]?.toUpperCase()}
      </div>
      <label
        style={{
          position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: "50%",
          background: "#fff", border: "1px solid var(--glass-border)", display: "grid", placeItems: "center",
          cursor: "pointer", boxShadow: "var(--shadow-glow)",
        }}
      >
        <Camera size={12} color="var(--text-mid)" />
        <input type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      </label>
    </div>
  );
}

// `user` is the profile record from GET /users/me (name, email, mobile, dob, semesters…).
// `onSave(patch)` should PATCH /users/me and resolve/reject.
export default function ProfileForm({ user, onSave }) {
  const [form, setForm] = useState({
    name: user.name || "",
    email: user.email || "",
    mobile: user.mobile || "",
    dob: user.dob || "",
  });
  const [marks, setMarks] = useState(user.semesters?.length ? user.semesters.map((s) => ({ sem: s.sem, gpa: s.gpa })) : []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm({ name: user.name || "", email: user.email || "", mobile: user.mobile || "", dob: user.dob || "" });
    setMarks(user.semesters?.length ? user.semesters.map((s) => ({ sem: s.sem, gpa: s.gpa })) : []);
  }, [user]);

  const update = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); };
  const updateMark = (i, v) => {
    setMarks((m) => m.map((row, idx) => (idx === i ? { ...row, gpa: Number(v) } : row)));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: form.name, mobile: form.mobile, dob: form.dob, semesters: marks });
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22, flexWrap: "wrap" }}>
        <ProfilePhoto name={form.name} />
        <div>
          <div className="h-display" style={{ fontSize: 17 }}>{form.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-lo)" }}>{user.id}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 16, marginBottom: marks.length ? 20 : 4 }}>
        <div>
          <label className="field-label">Full name</label>
          <input className="field-input" value={form.name} onChange={update("name")} />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input className="field-input" type="email" value={form.email} disabled title="Email is managed by your account, not editable here." />
        </div>
        <div>
          <label className="field-label">Mobile number</label>
          <input className="field-input" placeholder="+91 9xxxxxxxxx" value={form.mobile} onChange={update("mobile")} />
        </div>
        <div>
          <label className="field-label">Date of birth</label>
          <input className="field-input" type="date" value={form.dob} onChange={update("dob")} />
        </div>
      </div>

      {marks.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <span className="eyebrow">Semester marks (GPA)</span>
          <div className="grid grid-3" style={{ gap: 10, marginTop: 10 }}>
            {marks.map((row, i) => (
              <div key={row.sem}>
                <label className="field-label">{row.sem}</label>
                <input
                  className="field-input" type="number" step="0.01" min="0" max="10"
                  value={row.gpa}
                  onChange={(e) => updateMark(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: "var(--accent-rose, #dc2626)", marginBottom: 12 }}>{error}</p>}

      <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
        <Save size={13} /> {saving ? "Saving…" : saved ? "Saved" : "Save profile"}
      </button>
    </GlassCard>
  );
}
