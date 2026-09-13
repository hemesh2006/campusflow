import { useEffect, useState } from "react";
import { Users, Building2, ShieldCheck } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listMessages, postMessage } from "../../api/messages";
import { listDirectory } from "../../api/users";
import { useAuth } from "../../context/AuthContext";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function PrincipalGroup() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("hod"); // 'hod' | 'class'
  const [advisorList, setAdvisorList] = useState([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all advisors for class tab dropdown
  useEffect(() => {
    listDirectory()
      .then((users) => setAdvisorList(users.filter((u) => u.role === "class_advisor")))
      .catch(() => {});
  }, []);

  const groupId = activeTab === "hod" ? "principal-hod" : selectedAdvisor ? `class-${selectedAdvisor.id}` : null;

  // Load messages whenever groupId changes
  useEffect(() => {
    if (!groupId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMessages(groupId)
      .then((data) => { if (!cancelled) setItems(data.map(toFeedItem)); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load messages."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId]);

  const handleSend = async (text) => {
    if (!groupId) return;
    try {
      await postMessage({ group: groupId, text });
      const data = await listMessages(groupId);
      setItems(data.map(toFeedItem));
    } catch {
      setError("Message may not have been saved — check your connection.");
    }
  };

  return (
    <AppShell title="Principal Messaging" subtitle="Access to HOD circle and all class advisor groups">
      {/* Tab selector */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button className={`btn ${activeTab === "hod" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("hod")}>
          <ShieldCheck size={14} /> HOD & Principal Circle
        </button>
        <button className={`btn ${activeTab === "class" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("class")}>
          <Users size={14} /> Class Advisor Groups
        </button>
      </div>

      {/* Class advisor selector when in class tab */}
      {activeTab === "class" && (
        <GlassCard style={{ padding: 12, marginBottom: 16 }}>
          <select
            className="field-input"
            style={{ width: "100%" }}
            value={selectedAdvisor?.id || ""}
            onChange={(e) => {
              const adv = advisorList.find((a) => a.id === e.target.value);
              setSelectedAdvisor(adv || null);
            }}
          >
            <option value="" disabled>Select a Class Advisor</option>
            {advisorList.map((adv) => (
              <option key={adv.id} value={adv.id}>
                {adv.name} ({adv.dept})
              </option>
            ))}
          </select>
        </GlassCard>
      )}

      <CommonGroupFeed
        items={items}
        trackClicks
        allowPost
        moderate
        posterName={user ? `${user.name} (You)` : "You"}
        title={activeTab === "hod" ? "Principal‑HOD Circle" : selectedAdvisor ? `${selectedAdvisor.name}'s Class Group` : "Select a Class Advisor"}
        groupName={activeTab === "hod" ? "Principal & HODs" : selectedAdvisor ? `Class – ${selectedAdvisor.dept}` : "Class Advisor Groups"}
        onSend={handleSend}
        loading={loading}
        error={error}
      />
    </AppShell>
  );
}
