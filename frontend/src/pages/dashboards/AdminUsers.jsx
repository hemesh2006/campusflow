import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, UserCheck, RefreshCw, AlertCircle, Settings2, Trash2 } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, RoleBadge } from "../../components/common/Primitives";
import { DEPARTMENTS, ROLES, ROLE_META } from "../../data/mockData";
import { listUsers, adminUpdateUserRole, assignPrincipal, removeHierarchyRole, deleteUser } from "../../api/users";
import { useAuth } from "../../context/AuthContext";

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingUser, setEditingUser] = useState(null); // { id, role, dept }
  const [removingAll, setRemovingAll] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    return listUsers()
      .then(setUsers)
      .catch((err) => setError(err.status === 403 ? "You don't have permission to view users." : err.message || "Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRoleChangeSubmit = async (userId, role, dept) => {
    setBusyId(userId);
    setError(null);
    try {
      await adminUpdateUserRole(userId, role, dept);
      setEditingUser(null);
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to update user role.");
    } finally {
      setBusyId(null);
    }
  };

  const handleAssignPrincipal = async (userId) => {
    setBusyId(userId);
    setError(null);
    try {
      await assignPrincipal(userId);
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to assign Principal.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveRole = async (userId) => {
    setBusyId(userId);
    setError(null);
    try {
      await removeHierarchyRole(userId);
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to reset user role.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveAllUsers = async () => {
    const removableUsers = users.filter((candidate) => candidate.id !== currentUser?.id);
    if (!removableUsers.length) return;
    const confirmed = window.confirm(
      `Remove ${removableUsers.length} user${removableUsers.length === 1 ? "" : "s"}? Your admin account will be kept.`,
    );
    if (!confirmed) return;

    setRemovingAll(true);
    setError(null);
    try {
      await Promise.all(removableUsers.map((candidate) => deleteUser(candidate.id)));
      setEditingUser(null);
      await refresh();
    } catch (err) {
      setError(err.message || "Some users could not be removed.");
      await refresh();
    } finally {
      setRemovingAll(false);
    }
  };

  const principals = users.filter((u) => u.role === "principal");

  return (
    <AppShell title="Users & Roles Management" subtitle="Admin control — manually assign and edit roles for all registered users">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, maxWidth: 540, lineHeight: 1.6 }}>
          Roles are no longer assigned by email syntax. Admin manually manages roles for all registered accounts.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading || removingAll}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--accent-rose, #dc2626)", borderColor: "rgba(220,38,38,0.24)" }}
            onClick={handleRemoveAllUsers}
            disabled={loading || removingAll || users.filter((candidate) => candidate.id !== currentUser?.id).length === 0}
          >
            <Trash2 size={13} /> {removingAll ? "Removing…" : "Remove all other users"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16, borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "var(--accent-rose, #dc2626)", fontSize: 12.5 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Principal Section */}
      <GlassCard style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <ShieldCheck size={18} color="var(--role-principal, #a855f7)" />
          <h2 className="h-display" style={{ fontSize: 16, margin: 0 }}>Institution Principal</h2>
        </div>
        {principals.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No Principal assigned yet. Select a registered user below to assign as Principal.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {principals.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="avatar" style={{ background: "var(--role-principal, #a855f7)" }}>{p.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-lo)", fontFamily: "var(--font-mono)" }}>{p.email}</div>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--accent-rose, #dc2626)" }}
                  onClick={() => handleRemoveRole(p.id)}
                  disabled={busyId === p.id}
                >
                  Reset Role
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* User Directory & Manual Role Editor */}
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="eyebrow">All Registered Users ({users.length})</span>
        </div>
        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--text-lo)" }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 24, fontSize: 12.5, color: "var(--text-faint)" }}>No registered users found.</div>
        ) : (
          users.map((u) => {
            const isEditing = editingUser?.id === u.id;
            return (
              <div key={u.id} style={{ borderBottom: "1px solid var(--glass-border)", padding: "14px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div className="avatar">{u.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-lo)", fontFamily: "var(--font-mono)" }}>{u.email}</div>
                  </div>
                  <span className="pill desktop-only">{u.dept || "Unassigned"}</span>
                  <RoleBadge role={u.role} meta={ROLE_META} />

                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingUser(isEditing ? null : { id: u.id, role: u.role, dept: u.dept || DEPARTMENTS[0] })}
                    disabled={busyId === u.id}
                  >
                    <Settings2 size={13} /> {isEditing ? "Cancel" : "Manage Role"}
                  </button>
                </div>

                {isEditing && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--glass-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ width: 140 }}>
                      <label className="field-label" style={{ fontSize: 11 }}>Role</label>
                      <select
                        className="field-input"
                        style={{ padding: "6px 10px", fontSize: 12.5 }}
                        value={editingUser.role}
                        onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                      >
                        {Object.values(ROLES).map((r) => (
                          <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>
                        ))}
                      </select>
                    </div>

                    {["hod", "advisor"].includes(editingUser.role) && (
                      <div style={{ width: 150 }}>
                        <label className="field-label" style={{ fontSize: 11 }}>Department</label>
                        <select
                          className="field-input"
                          style={{ padding: "6px 10px", fontSize: 12.5 }}
                          value={editingUser.dept}
                          onChange={(e) => setEditingUser({ ...editingUser, dept: e.target.value })}
                        >
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 18 }}
                      disabled={busyId === u.id}
                      onClick={() => handleRoleChangeSubmit(u.id, editingUser.role, editingUser.dept)}
                    >
                      <UserCheck size={13} /> {busyId === u.id ? "Saving…" : "Save Role"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </GlassCard>
    </AppShell>
  );
}
