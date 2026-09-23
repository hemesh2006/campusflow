import { useState, useEffect } from "react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listMessages, postMessage } from "../../api/messages";
import { classifyMessage } from "../../api/assistant";
import { useAuth } from "../../context/AuthContext";
import { Users, Building2 } from "lucide-react";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function AdvisorGroup() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("class"); // 'class' | 'hod'
  const [instruction, setInstruction] = useState(
    "If a placement message arrives, forward it immediately and mark students who haven't opened it within 2 hours."
  );
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [classification, setClassification] = useState(null);
  const [classifying, setClassifying] = useState(false);

  const deptSlug = user?.dept ? user.dept.toLowerCase().replace(/[^a-z0-9]/g, "") : "general";
  const groupId = activeTab === "class" ? (user?.id ? `class-${user.id}` : "class-unassigned") : `hod-advisor-${deptSlug}`;

  useEffect(() => {
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
    setClassifying(true);
    setError(null);
    try {
      const result = await classifyMessage(text);
      const workflow = result.classification;
      setClassification({ ...workflow, model: result.model });
      await postMessage({ group: groupId, text, workflow });
      const data = await listMessages(groupId);
      setItems(data.map(toFeedItem));
    } catch (err) {
      setError(err.message || "Message classification failed — check Ollama and try again.");
    } finally {
      setClassifying(false);
    }
  };

  return (
    <AppShell title="Group Messaging" subtitle="Class Advisor View — Class Students Group & HOD Circle">
      {/* Group Switcher Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          className={`btn ${activeTab === "class" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("class")}
        >
          <Users size={14} /> My Class Group ({user?.dept || "Class"})
        </button>
        <button
          className={`btn ${activeTab === "hod" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("hod")}
        >
          <Building2 size={14} /> HOD & Advisor Circle ({user?.dept || "Dept"})
        </button>
      </div>

      <div className="grid grid-main-side">
        <CommonGroupFeed
          key={groupId}
          items={items}
          trackClicks
          title={activeTab === "class" ? `${user?.dept || "Class"} · Students Group` : `${user?.dept || "Dept"} · HOD & Advisor Circle`}
          groupName={activeTab === "class" ? "Your assigned class roster" : `HOD & Class Advisors of ${user?.dept || "Department"}`}
          allowPost
          posterName={user ? `${user.name} (You)` : "You"}
          moderate
          onSend={handleSend}
          loading={loading}
          error={error}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Agent instructions</span>
            <p style={{ fontSize: 12, color: "var(--text-lo)", margin: "8px 0 12px", lineHeight: 1.6 }}>
              Guide how your class agent should act on new group messages — editable any time.
            </p>
            <textarea
              className="field-input"
              rows={5}
              style={{ resize: "vertical" }}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: "100%" }}>
              Save instruction
            </button>
          </GlassCard>

          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Live message classifier</span>
            <p style={{ fontSize: 12, color: "var(--text-lo)", margin: "8px 0 12px", lineHeight: 1.6 }}>
              New announcements are classified by the active Ollama model before they reach the class feed.
            </p>
            {classifying && <p style={{ fontSize: 12, color: "var(--accent-blue)" }}>Analyzing with Ollama…</p>}
            {!classifying && classification && (
              <div style={{ padding: 12, borderRadius: 12, background: "var(--bg-3)", border: "1px solid var(--glass-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{classification.title}</strong>
                  <span className="pill">{classification.category}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-mid)", margin: "8px 0" }}>{classification.summary}</p>
                <span style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                  Action: {classification.action_type} · {classification.model}
                </span>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}
