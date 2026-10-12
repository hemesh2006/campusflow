import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listMessages, postMessage } from "../../api/messages";
import { detectGroupTaskIntent } from "../../api/groupTasks";
import { useAuth } from "../../context/AuthContext";
import { Users, Building2, Sparkles, ArrowRight, Loader2, CheckCircle2, Briefcase, ClipboardList, Bot } from "lucide-react";

function toFeedItem(m) {
  return { id: m.id, from: m.from_name, text: m.text, time: new Date(m.created_at).toLocaleString(), clicks: 0, total: 1, link: m.link, attachment: m.attachment };
}

export default function AdvisorGroup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("class"); // 'class' | 'hod'
  const [instruction, setInstruction] = useState(
    "If a placement message arrives, forward it immediately and mark students who haven't opened it within 2 hours."
  );
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [classification, setClassification] = useState(null);
  const [classifying, setClassifying] = useState(false);
  const [detectBanner, setDetectBanner] = useState(null);

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
    setDetectBanner({
      status: "analyzing",
      text,
      message: `Analyzing message with Ollama AI model…`,
    });

    try {
      // 1. Post message to group feed
      await postMessage({ group: groupId, text });
      const data = await listMessages(groupId);
      setItems(data.map(toFeedItem));

      // 2. Detect intent via Ollama model communication
      const detected = await detectGroupTaskIntent(text, groupId);
      setClassification({
        title: detected.title,
        category: detected.category,
        summary: detected.description,
        model: detected.model_used || "ollama",
      });

      if (detected.category === "task") {
        setDetectBanner({
          status: "task",
          text,
          detected,
          message: `🎯 Ollama AI detected a Task ("${detected.title}")! Moving to Task Creation to confirm…`,
        });
        setTimeout(() => {
          navigate("/advisor/group-tasks", {
            state: {
              prefillTask: {
                title: detected.title,
                description: text,
                completion_modes: detected.completion_modes || ["form", "mark_done"],
                due: detected.due || "",
                category: "task",
              },
              originalMessage: text,
            },
          });
        }, 1200);
      } else if (detected.category === "drive") {
        const comp = detected.drive_company || "Company Drive";
        const pkg = detected.drive_package ? ` (${detected.drive_package})` : "";
        setDetectBanner({
          status: "drive",
          text,
          detected,
          message: `💼 Ollama AI detected a Placement Drive: ${comp}${pkg}! Moving to Drive Creation to confirm…`,
        });
        setTimeout(() => {
          navigate("/advisor/placements", {
            state: {
              prefillDrive: {
                company: detected.drive_company || "Placement Drive",
                role: detected.drive_role || "On-campus Drive",
                package: detected.drive_package || "",
                deadline: detected.due || "",
              },
              originalMessage: text,
            },
          });
        }, 1200);
      } else {
        setDetectBanner({
          status: "general",
          text,
          message: `✅ Announcement published. (General message — no task or drive detected)`,
        });
        setTimeout(() => setDetectBanner(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to process message.");
      setDetectBanner(null);
    } finally {
      setClassifying(false);
    }
  };


  return (
    <AppShell title="Group Messaging" subtitle="Class Advisor View — Class Students Group & HOD Circle">
      {/* Real-time Ollama Detection Alert Banner */}
      {detectBanner && (
        <div style={{
          marginBottom: 16,
          padding: "12px 18px",
          borderRadius: 12,
          background: detectBanner.status === "task"
            ? "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.18))"
            : detectBanner.status === "drive"
            ? "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.18))"
            : detectBanner.status === "analyzing"
            ? "rgba(59,130,246,0.12)"
            : "rgba(107,114,128,0.12)",
          border: `1px solid ${
            detectBanner.status === "task"
              ? "rgba(99,102,241,0.4)"
              : detectBanner.status === "drive"
              ? "rgba(16,185,129,0.4)"
              : "rgba(59,130,246,0.3)"
          }`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          {detectBanner.status === "analyzing" && <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} color="var(--accent-blue)" />}
          {detectBanner.status === "task" && <ClipboardList size={18} color="#6366f1" />}
          {detectBanner.status === "drive" && <Briefcase size={18} color="#10b981" />}
          {detectBanner.status === "general" && <CheckCircle2 size={18} color="#6b7280" />}

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-hi)" }}>
              {detectBanner.message}
            </div>
            {detectBanner.text && (
              <div style={{ fontSize: 11.5, color: "var(--text-mid)", marginTop: 2 }}>
                Message: <em>"{detectBanner.text}"</em>
              </div>
            )}
          </div>

          {(detectBanner.status === "task" || detectBanner.status === "drive") && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (detectBanner.status === "task") {
                  navigate("/advisor/group-tasks", {
                    state: {
                      prefillTask: {
                        title: detectBanner.detected?.title || "Task",
                        description: detectBanner.text,
                        completion_modes: detectBanner.detected?.completion_modes || ["form", "mark_done"],
                        due: detectBanner.detected?.due || "",
                        category: "task",
                      },
                      originalMessage: detectBanner.text,
                    },
                  });
                } else {
                  navigate("/advisor/placements", {
                    state: {
                      prefillDrive: {
                        company: detectBanner.detected?.drive_company || "Placement Drive",
                        role: detectBanner.detected?.drive_role || "On-campus Drive",
                        package: detectBanner.detected?.drive_package || "",
                        deadline: detectBanner.detected?.due || "",
                      },
                      originalMessage: detectBanner.text,
                    },
                  });
                }
              }}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              Confirm Now <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}

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
