import { useEffect, useState } from "react";
import { UsersRound, Phone, FileText } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import ProfileForm from "../../components/common/ProfileForm";
import TelegramConnect from "../../components/common/TelegramConnect";
import { getMyProfile, updateMyProfile } from "../../api/users";

export default function StudentProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load profile."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (patch) => {
    const updated = await updateMyProfile(patch);
    setProfile(updated);
  };

  if (loading) {
    return (
      <AppShell title="Profile" subtitle="Personal details, contact, linking and completeness">
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading profile…</p>
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell title="Profile" subtitle="Personal details, contact, linking and completeness">
        <p style={{ fontSize: 13, color: "var(--accent-rose, #dc2626)" }}>{error || "Profile unavailable."}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile" subtitle="Personal details, contact, linking and completeness">
      <div className="grid grid-main-side">
        <ProfileForm user={profile} onSave={handleSave} />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <TelegramConnect />

          <GlassCard style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <UsersRound size={16} color="var(--accent-blue-soft)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Friend link</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-lo)", lineHeight: 1.6, marginBottom: 12 }}>
              Link a friend's agent to yours so shared decisions — like grouping
              for a placement drive slot — are made together.
            </p>
            <div className="pill" style={{ marginBottom: 10 }}>No friend linked yet</div>
            <button className="btn btn-ghost btn-sm">Send friend link request</button>
          </GlassCard>

          <GlassCard style={{ padding: 20 }}>
            <span className="eyebrow">Profile completeness</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                <Phone size={13} color="var(--accent-emerald)" /> Contact number {profile.mobile ? `on file — ${profile.mobile}` : "not on file"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                <FileText size={13} color={profile.resume_uploaded ? "var(--accent-emerald)" : "var(--text-faint)"} />
                Resume {profile.resume_uploaded ? "uploaded" : "not uploaded"}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
