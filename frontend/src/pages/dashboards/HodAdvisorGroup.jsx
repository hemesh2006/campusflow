import { useEffect, useState, useCallback } from "react";
import { Info, Building2, ShieldCheck } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listMessages, postMessage } from "../../api/messages";
import { useAuth } from "../../context/AuthContext";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function HodAdvisorGroup() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("advisor"); // 'advisor' | 'principal'

  // Separate state per group so switching tabs never leaks messages across groups
  const [groupState, setGroupState] = useState({
    "advisor": { items: [], loading: true, error: null },
    "principal": { items: [], loading: true, error: null },
  });

  const deptSlug = user?.dept ? user.dept.toLowerCase().replace(/[^a-z0-9]/g, "") : "general";

  const getGroupId = useCallback((tab) => {
    return tab === "advisor" ? `hod-advisor-${deptSlug}` : "principal-hod";
  }, [deptSlug]);

  const groupId = getGroupId(activeTab);

  // Load messages for a specific tab (only that tab's group)
  const loadGroup = useCallback((tab) => {
    const gid = getGroupId(tab);
    setGroupState(prev => ({ ...prev, [tab]: { ...prev[tab], loading: true, error: null } }));
    listMessages(gid)
      .then((data) => {
        setGroupState(prev => ({ ...prev, [tab]: { items: data.map(toFeedItem), loading: false, error: null } }));
      })
      .catch((err) => {
        setGroupState(prev => ({ ...prev, [tab]: { ...prev[tab], loading: false, error: err.message || "Failed to load messages." } }));
      });
  }, [getGroupId]);

  // Load each tab independently on mount
  useEffect(() => { loadGroup("advisor"); }, [loadGroup]);
  useEffect(() => { loadGroup("principal"); }, [loadGroup]);

  // handleSend captures the active tab at call time — message only goes to that specific group
  const handleSend = async (text) => {
    const currentTab = activeTab;           // capture current tab
    const currentGroupId = getGroupId(currentTab); // capture current groupId
    try {
      await postMessage({ group: currentGroupId, text }); // post ONLY to this group
      const data = await listMessages(currentGroupId);
      setGroupState(prev => ({
        ...prev,
        [currentTab]: { items: data.map(toFeedItem), loading: false, error: null },
      }));
    } catch {
      setGroupState(prev => ({
        ...prev,
        [currentTab]: { ...prev[currentTab], error: "Message may not have been saved — check your connection." },
      }));
    }
  };

  const { items, loading, error } = groupState[activeTab];

  return (
    <AppShell title="Department & Hierarchy Messaging" subtitle={`HOD View — ${user?.dept || "Department"}`}>
      {/* Group Switcher Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          className={`btn ${activeTab === "advisor" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("advisor")}
        >
          <Building2 size={14} /> HOD & Advisor Circle ({user?.dept || "Dept"})
        </button>
        <button
          className={`btn ${activeTab === "principal" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("principal")}
        >
          <ShieldCheck size={14} /> Principal & HOD Circle
        </button>
      </div>

      <div className="grid grid-main-side">
        <CommonGroupFeed key={groupId}
          items={items}
          trackClicks
          allowPost
          moderate
          posterName={user ? `${user.name} (You)` : "You"}
          title={activeTab === "advisor" ? `${user?.dept || "Dept"} · HOD & Advisor Circle` : "Principal · HOD Circle"}
          groupName={activeTab === "advisor" ? `${user?.dept || "Dept"} — Class Advisors` : "Institution Principal & Department HODs"}
          onSend={handleSend}
          loading={loading}
          error={error}
        />
        <GlassCard style={{ padding: 18, height: "fit-content" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Info size={15} color="var(--accent-blue)" />
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Hierarchy Note</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-lo)", lineHeight: 1.7 }}>
            {activeTab === "advisor"
              ? `Messages here reach Class Advisors in the ${user?.dept || "department"} department only. Not shared with Principal.`
              : "Messages here reach the Principal and other HODs only. Not shared with Class Advisors."}
          </p>
        </GlassCard>
      </div>
    </AppShell>
  );
}
