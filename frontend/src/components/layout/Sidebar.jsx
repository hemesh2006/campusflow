import { NavLink } from "react-router-dom";
import {
  LayoutGrid, Users, Network, ListChecks, MessageSquare, ShieldAlert,
  Building2, GraduationCap, Briefcase, TrendingUp, UserCircle2, BellRing, Cpu, Send, Home, LogOut,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ROLES, ROLE_META } from "../../data/mockData";
import { RoleBadge } from "../common/Primitives";

const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { to: "/admin", label: "Overview", icon: LayoutGrid, end: true },
    { to: "/admin/network", label: "Agent network", icon: Network },
    { to: "/admin/agent-manager", label: "Agent manager", icon: Cpu },
    { to: "/admin/users", label: "Users & roles", icon: Users },
    { to: "/admin/message", label: "Direct message", icon: Send },
    { to: "/admin/reports", label: "Reports & help", icon: ShieldAlert },
    { to: "/admin/notifications", label: "Profile", icon: BellRing },
  ],
  [ROLES.PRINCIPAL]: [
    { to: "/principal", label: "Institution", icon: LayoutGrid, end: true },
    { to: "/principal/departments", label: "Departments", icon: Building2 },
    { to: "/principal/group", label: "HOD group", icon: MessageSquare },
    { to: "/principal/messages", label: "Messages", icon: Send },
    { to: "/principal/notifications", label: "Profile", icon: BellRing },
  ],
  [ROLES.HOD]: [
    { to: "/hod", label: "Department", icon: LayoutGrid, end: true },
    { to: "/hod/network", label: "Agent network", icon: Network },
    { to: "/hod/group", label: "Advisor group", icon: MessageSquare },
    { to: "/hod/messages", label: "Messages", icon: Send },
    { to: "/hod/notifications", label: "Profile", icon: BellRing },
  ],
  [ROLES.ADVISOR]: [
    { to: "/advisor", label: "Class board", icon: LayoutGrid, end: true },
    { to: "/advisor/students", label: "Students", icon: GraduationCap },
    { to: "/advisor/placements", label: "Placements", icon: Briefcase },
    { to: "/advisor/network", label: "Agent network", icon: Network },
    { to: "/advisor/group", label: "Common group", icon: MessageSquare },
    { to: "/advisor/messages", label: "Messages", icon: Send },
    { to: "/advisor/notifications", label: "Profile", icon: BellRing },
  ],
  [ROLES.STUDENT]: [
    { to: "/student", label: "Dashboard", icon: Home, end: true },
    { to: "/student/tasks", label: "Tasks", icon: ListChecks },
    { to: "/student/placements", label: "Placements", icon: Briefcase },
    { to: "/student/skills", label: "Skills", icon: TrendingUp },
    { to: "/student/group", label: "Common group", icon: MessageSquare },
    { to: "/student/messages", label: "Messages", icon: Send },
    { to: "/student/profile", label: "Profile", icon: UserCircle2 },
  ],
};

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout } = useAuth();
  const items = NAV_BY_ROLE[user.role] || [];

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar glass ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <GraduationCap size={17} />
          </div>
          <div>
            <div className="h-display" style={{ fontSize: 16, color: "#fff", lineHeight: 1.15 }}>CampusFlow</div>
            <div style={{ fontSize: 10, color: "var(--sidebar-text-dim)", letterSpacing: "0.04em" }}>Learn · Build · Grow</div>
          </div>
        </div>

        <div style={{ padding: "0 18px 14px" }}>
          <RoleBadge role={user.role} meta={ROLE_META} />
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
            >
              <item.icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div className="avatar">{user.name?.[0]?.toUpperCase()}</div>
              <span style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: "var(--accent-emerald)", border: "2px solid var(--sidebar-bg)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff" }}>{user.name}</div>
              <div style={{ fontSize: 11, color: "var(--sidebar-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.id}</div>
            </div>
          </div>
          <button className="btn btn-sm" style={{ width: "100%", marginTop: 12, background: "var(--accent-blue)", color: "#fff" }} onClick={logout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
