import { useState, useEffect } from "react";
import { Bell, Moon, Sun, Monitor, Bot, Eye, EyeOff, CheckCircle, Save, RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/layout/AppShell";
import ProfileForm from "../../components/common/ProfileForm";
import TelegramConnect from "../../components/common/TelegramConnect";
import { updateMyProfile, getMySettings, updateMySettings } from "../../api/users";
import { GlassCard } from "../../components/common/Primitives";

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
function ThemeToggle({ value, onChange }) {
  const options = [
    { key: "light", icon: Sun, label: "Light" },
    { key: "system", icon: Monitor, label: "System" },
    { key: "dark", icon: Moon, label: "Dark" },
  ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
            padding: "10px 8px", borderRadius: 10, border: "1.5px solid",
            borderColor: value === key ? "var(--accent-blue)" : "var(--glass-border)",
            background: value === key ? "rgba(99,102,241,0.12)" : "transparent",
            color: value === key ? "var(--accent-blue)" : "var(--text-mid)",
            cursor: "pointer", fontSize: 11, fontWeight: value === key ? 600 : 400,
            transition: "all 0.18s ease",
          }}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid var(--glass-border)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-hi)" }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: "var(--text-lo)", marginTop: 2 }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
          background: checked ? "var(--accent-blue)" : "var(--glass-border)",
          position: "relative", transition: "background 0.2s ease", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s ease", display: "block",
        }} />
      </button>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: "rgba(99,102,241,0.12)",
        display: "grid", placeItems: "center",
      }}>
        <Icon size={16} color="var(--accent-blue)" />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-hi)" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "var(--text-lo)" }}>{subtitle}</div>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccountNotifications() {
  const { user, setUser } = useAuth();

  // Settings state
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Load settings from backend on mount
  useEffect(() => {
    let active = true;
    setLoadingSettings(true);
    getMySettings()
      .then((data) => { if (active) setSettings(data); })
      .catch(() => {
        // Fallback to defaults from user object if API not available
        if (active && user?.settings) setSettings(user.settings);
        else if (active) setSettings({
          theme: "system",
          notifications: { email: true, telegram: false, academic_alerts: true, announcements: true, attendance_warnings: true },
          ai_assistant: { enabled: true, preferred_model: null, response_style: "concise", auto_context: true, permission_aware: true },
          privacy: { profile_visible: true, show_contact: false },
        });
      })
      .finally(() => { if (active) setLoadingSettings(false); });
    return () => { active = false; };
  }, [user?.id]);

  // Helper setters
  const set = (section, key, value) => {
    setSaved(false);
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const setTheme = (value) => {
    setSaved(false);
    setSettings((prev) => ({ ...prev, theme: value }));
  };

  // Save settings → PATCH /users/me/settings → backend → MongoDB → user_hierarchy.json auto-updated
  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMySettings(settings);
      setSettings(updated);
      // Also persist to user context so UI reflects immediately
      if (setUser && user) setUser({ ...user, settings: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err?.message || "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Profile save
  const handleProfileSave = async (patch) => {
    const updated = await updateMyProfile(patch);
    if (setUser) setUser(updated);
  };

  return (
    <AppShell title="Profile & Settings" subtitle="Manage your personal details, notifications, and AI preferences">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* Left Column — Profile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ProfileForm user={user} onSave={handleProfileSave} />
          <TelegramConnect />
        </div>

        {/* Right Column — Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {loadingSettings ? (
            <GlassCard style={{ padding: 24, display: "flex", alignItems: "center", gap: 10, color: "var(--text-lo)", fontSize: 13 }}>
              <RefreshCw size={15} className="spin" /> Loading settings…
            </GlassCard>
          ) : settings && (
            <>
              {/* ── Appearance ── */}
              <GlassCard style={{ padding: 20 }}>
                <SectionHeader icon={Moon} title="Appearance" subtitle="Theme and display preferences" />
                <label style={{ fontSize: 12, color: "var(--text-lo)", display: "block", marginBottom: 8 }}>COLOR THEME</label>
                <ThemeToggle value={settings.theme} onChange={setTheme} />
              </GlassCard>

              {/* ── Notifications ── */}
              <GlassCard style={{ padding: 20 }}>
                <SectionHeader icon={Bell} title="Notifications" subtitle="Control when and how CampusFlow reaches you" />
                <ToggleRow
                  label="Email notifications"
                  description="Receive updates and alerts by email"
                  checked={settings.notifications?.email ?? true}
                  onChange={(v) => set("notifications", "email", v)}
                />
                <ToggleRow
                  label="Telegram alerts"
                  description="Get messages via the linked Telegram bot"
                  checked={settings.notifications?.telegram ?? false}
                  onChange={(v) => set("notifications", "telegram", v)}
                />
                <ToggleRow
                  label="Academic alerts"
                  description="Attendance shortages, CGPA updates, deadline reminders"
                  checked={settings.notifications?.academic_alerts ?? true}
                  onChange={(v) => set("notifications", "academic_alerts", v)}
                />
                <ToggleRow
                  label="Announcements"
                  description="Department and class broadcasts from advisors, HODs"
                  checked={settings.notifications?.announcements ?? true}
                  onChange={(v) => set("notifications", "announcements", v)}
                />
                <ToggleRow
                  label="Attendance warnings"
                  description="Official shortage alerts sent by advisors"
                  checked={settings.notifications?.attendance_warnings ?? true}
                  onChange={(v) => set("notifications", "attendance_warnings", v)}
                />
              </GlassCard>

              {/* ── AI Assistant ── */}
              <GlassCard style={{ padding: 20 }}>
                <SectionHeader icon={Bot} title="AI Assistant" subtitle="Control how the personal assistant behaves" />
                <ToggleRow
                  label="Enable AI assistant"
                  description="Show the floating assistant chat bubble"
                  checked={settings.ai_assistant?.enabled ?? true}
                  onChange={(v) => set("ai_assistant", "enabled", v)}
                />
                <ToggleRow
                  label="Auto-load context"
                  description="Automatically load your profile snapshot before each response"
                  checked={settings.ai_assistant?.auto_context ?? true}
                  onChange={(v) => set("ai_assistant", "auto_context", v)}
                />
                <ToggleRow
                  label="Permission-aware mode"
                  description="Restrict AI suggestions to your role and authority scope"
                  checked={settings.ai_assistant?.permission_aware ?? true}
                  onChange={(v) => set("ai_assistant", "permission_aware", v)}
                />
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 12, color: "var(--text-lo)", display: "block", marginBottom: 6 }}>RESPONSE STYLE</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["concise", "academic", "executive", "detailed"].map((style) => (
                      <button
                        key={style}
                        onClick={() => set("ai_assistant", "response_style", style)}
                        style={{
                          flex: 1, padding: "7px 6px", borderRadius: 8, border: "1.5px solid",
                          borderColor: settings.ai_assistant?.response_style === style ? "var(--accent-blue)" : "var(--glass-border)",
                          background: settings.ai_assistant?.response_style === style ? "rgba(99,102,241,0.12)" : "transparent",
                          color: settings.ai_assistant?.response_style === style ? "var(--accent-blue)" : "var(--text-mid)",
                          cursor: "pointer", fontSize: 10, fontWeight: 500, textTransform: "capitalize",
                          transition: "all 0.18s ease",
                        }}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              </GlassCard>

              {/* ── Privacy ── */}
              <GlassCard style={{ padding: 20 }}>
                <SectionHeader icon={Eye} title="Privacy" subtitle="Control who can see your information" />
                <ToggleRow
                  label="Profile visible to others"
                  description="Allow other users in your institution to view your profile"
                  checked={settings.privacy?.profile_visible ?? true}
                  onChange={(v) => set("privacy", "profile_visible", v)}
                />
                <ToggleRow
                  label="Show contact details"
                  description="Display your mobile number in the user directory"
                  checked={settings.privacy?.show_contact ?? false}
                  onChange={(v) => set("privacy", "show_contact", v)}
                />
              </GlassCard>

              {/* ── Save Button ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={saveSettings}
                  disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 7 }}
                >
                  {saving ? <RefreshCw size={14} className="spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
                  {saving ? "Saving…" : saved ? "Saved!" : "Save settings"}
                </button>
                {saved && (
                  <span style={{ fontSize: 12, color: "var(--accent-teal, #14b8a6)", display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle size={13} /> Settings saved → MongoDB updated → user_hierarchy.json synchronized
                  </span>
                )}
                {error && <span style={{ fontSize: 12, color: "var(--accent-rose, #f43f5e)" }}>{error}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
