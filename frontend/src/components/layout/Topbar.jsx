import { Menu, Bell, Search } from "lucide-react";

export default function Topbar({ title, subtitle, onMenuClick }) {
  return (
    <header className="topbar glass">
      <button className="btn btn-ghost btn-sm mobile-only" onClick={onMenuClick} aria-label="Open menu">
        <Menu size={16} />
      </button>

      <div style={{ minWidth: 0 }}>
        <h1 className="h-display" style={{ fontSize: 19, margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12.5, color: "var(--text-lo)", margin: "2px 0 0" }}>{subtitle}</p>}
      </div>

      <div className="topbar-search desktop-only">
        <Search size={14} color="var(--text-lo)" />
        <input placeholder="Search students, agents, tasks…" />
      </div>

      <button className="icon-btn" aria-label="Notifications">
        <Bell size={16} />
        <span className="notif-dot" />
      </button>
    </header>
  );
}
