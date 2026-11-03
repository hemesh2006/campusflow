import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Bell, Search, Briefcase, CheckSquare, GraduationCap, Info, X, ExternalLink } from "lucide-react";
import { getAssistantNotifications } from "../../api/assistant";

const CATEGORY_ICONS = {
  drive: { icon: Briefcase, color: "var(--accent-violet, #8b5cf6)", bg: "rgba(139, 92, 246, 0.12)" },
  task: { icon: CheckSquare, color: "var(--accent-blue, #3b82f6)", bg: "rgba(59, 130, 246, 0.12)" },
  academic: { icon: GraduationCap, color: "var(--accent-emerald, #10b981)", bg: "rgba(16, 185, 129, 0.12)" },
  system: { icon: Info, color: "var(--accent-amber, #f59e0b)", bg: "rgba(245, 158, 11, 0.12)" },
};

export default function Topbar({ title, subtitle, onMenuClick }) {
  const navigate = useNavigate();
  const [openNotifs, setOpenNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const popoverRef = useRef(null);

  useEffect(() => {
    getAssistantNotifications()
      .then((data) => {
        if (Array.isArray(data)) setNotifications(data);
      })
      .catch(() => {});
  }, []);

  // Close notifications on outside click
  useEffect(() => {
    if (!openNotifs) return;
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenNotifs(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openNotifs]);

  const activeNotifs = notifications.filter((n) => !dismissedIds.has(n.id));
  const unreadCount = activeNotifs.length;

  const handleDismiss = (id, e) => {
    e.stopPropagation();
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  const handleNotifClick = (notif) => {
    if (notif.action_link) {
      navigate(notif.action_link);
      setOpenNotifs(false);
    }
  };

  return (
    <header className="topbar glass" style={{ position: "relative" }}>
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

      <div style={{ position: "relative" }} ref={popoverRef}>
        <button
          className="icon-btn"
          aria-label="Notifications"
          onClick={() => setOpenNotifs((o) => !o)}
          style={{ position: "relative" }}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span
              className="notif-dot"
              style={{
                width: 7,
                height: 7,
                background: "var(--accent-rose, #ef4444)",
                position: "absolute",
                top: 5,
                right: 5,
                borderRadius: "50%",
                boxShadow: "0 0 6px var(--accent-rose)",
              }}
            />
          )}
        </button>

        {/* ── Notification Popover Dropdown ── */}
        {openNotifs && (
          <div
            className="glass"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 10px)",
              width: 360,
              maxWidth: "90vw",
              maxHeight: "75vh",
              display: "flex",
              flexDirection: "column",
              borderRadius: 14,
              boxShadow: "0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--glass-border)",
              zIndex: 999,
              overflow: "hidden",
              animation: "fadeIn 0.18s ease",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--glass-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications &amp; Alerts</span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: "rgba(139,92,246,0.18)",
                      color: "var(--accent-violet)",
                      padding: "2px 7px",
                      borderRadius: 99,
                    }}
                  >
                    {unreadCount} active
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => setDismissedIds(new Set(notifications.map((n) => n.id)))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-faint)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Dismiss all
                </button>
              )}
            </div>

            {/* Notification List */}
            <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
              {activeNotifs.length === 0 ? (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-lo)" }}>
                  <Bell size={24} color="var(--text-faint)" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>All caught up!</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 4 }}>
                    No pending academic alerts or urgent placement notices.
                  </p>
                </div>
              ) : (
                activeNotifs.map((n) => {
                  const meta = CATEGORY_ICONS[n.category] || CATEGORY_ICONS.system;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      style={{
                        padding: "10px 16px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        cursor: n.action_link ? "pointer" : "default",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: meta.bg,
                          color: meta.color,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <Icon size={16} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-hi)" }}>
                            {n.title}
                          </span>
                          <button
                            onClick={(e) => handleDismiss(n.id, e)}
                            title="Dismiss"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-faint)",
                              cursor: "pointer",
                              padding: 2,
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <p style={{ fontSize: 11.5, color: "var(--text-mid)", margin: "3px 0 0", lineHeight: 1.4 }}>
                          {n.message}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: meta.color,
                            }}
                          >
                            {n.category}
                          </span>
                          {n.due && (
                            <span style={{ fontSize: 10, color: "var(--accent-amber)", fontFamily: "var(--font-mono)" }}>
                              Deadline: {n.due}
                            </span>
                          )}
                          {n.action_link && (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--accent-blue)",
                                marginLeft: "auto",
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              View <ExternalLink size={9} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
