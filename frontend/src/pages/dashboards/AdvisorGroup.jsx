import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { GlassCard } from "../../components/common/Primitives";
import CommonGroupFeed from "../../components/common/CommonGroupFeed";
import { listMessages, postMessage } from "../../api/messages";
import { detectGroupTaskIntent } from "../../api/groupTasks";
import { useAuth } from "../../context/AuthContext";
import {
  Users, Building2, Sparkles, ArrowRight, Loader2, CheckCircle2,
  Briefcase, ClipboardList, Bot, Zap, Clock, RefreshCw, AlertCircle, Cpu
} from "lucide-react";

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
  
  // Classification engine mode: 'auto' (Ollama with timeout fallback) | 'ollama' (strict) | 'local' (words-based)
  const [engineMode, setEngineMode] = useState("auto");
  const [testText, setTestText] = useState("");
  const [navTimer, setNavTimer] = useState(null);
  const activeClassifyRef = useRef(0);

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

  // Clean up auto-navigation timer if unmounted
  useEffect(() => {
    return () => {
      if (navTimer) clearTimeout(navTimer);
    };
  }, [navTimer]);

  const runClassification = async (text, overrideEngine = null) => {
    const currentRun = ++activeClassifyRef.current;
    const targetEngine = overrideEngine || engineMode;
    setClassifying(true);
    setError(null);

    // Initial banner
    setDetectBanner({
      status: "analyzing",
      text,
      engine: targetEngine,
      message: targetEngine === "local"
        ? "Classifying message with Local Words-based Engine…"
        : "Analyzing message with Ollama AI model (llama3.2)…",
      showTimeoutPrompt: false,
    });

    // If using Ollama or Auto, schedule a timeout prompt check at 2.6s
    let timeoutTimer = null;
    if (targetEngine !== "local") {
      timeoutTimer = setTimeout(() => {
        if (activeClassifyRef.current === currentRun) {
          setDetectBanner((prev) => {
            if (prev && prev.status === "analyzing") {
              return {
                ...prev,
                showTimeoutPrompt: true,
                message: "⏱️ Ollama server is taking time / approaching timeout…",
              };
            }
            return prev;
          });
        }
      }, 2600);
    }

    try {
      const detected = await detectGroupTaskIntent(text, groupId, {
        engine: targetEngine,
        timeout: 3.5,
      });

      if (activeClassifyRef.current !== currentRun) return; // Stale call
      if (timeoutTimer) clearTimeout(timeoutTimer);

      setClassification({
        title: detected.title,
        category: detected.category,
        summary: detected.description,
        model: detected.model_used || "ollama",
        engine: detected.engine || (targetEngine === "local" ? "local_rules" : "ollama"),
        timed_out: !!detected.timed_out,
        notice: detected.notice,
        detected,
      });

      const isLocal = detected.engine === "local_rules";
      const engineLabel = isLocal
        ? (detected.timed_out ? "⚡ Local Keyword Engine (Ollama Timeout Fallback)" : "⚡ Local Words Engine")
        : `✨ Real Ollama LLM (${detected.model_used || "llama3.2"})`;

      if (detected.category === "task") {
        setDetectBanner({
          status: "task",
          text,
          detected,
          engineLabel,
          isLocal,
          message: `${isLocal ? "⚡ Local Classifier" : "🎯 Ollama AI"} detected a Task: "${detected.title}"!`,
        });
      } else if (detected.category === "drive") {
        const comp = detected.drive_company || "Campus Drive";
        const pkg = detected.drive_package ? ` (${detected.drive_package})` : "";
        setDetectBanner({
          status: "drive",
          text,
          detected,
          engineLabel,
          isLocal,
          message: `💼 ${isLocal ? "⚡ Local Classifier" : "Ollama AI"} detected a Placement Drive: ${comp}${pkg}!`,
        });
      } else {
        setDetectBanner({
          status: "general",
          text,
          detected,
          engineLabel,
          isLocal,
          message: `✅ Announcement published (${engineLabel}: General message — no task or drive detected).`,
        });
        setTimeout(() => setDetectBanner(null), 5000);
      }
    } catch (err) {
      if (activeClassifyRef.current !== currentRun) return;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      console.error(err);
      setError(err.message || "Failed to classify message.");
      setDetectBanner(null);
    } finally {
      if (activeClassifyRef.current === currentRun) {
        setClassifying(false);
      }
    }
  };

  const handleSend = async (text) => {
    try {
      // 1. Post message to group feed
      await postMessage({ group: groupId, text });
      const data = await listMessages(groupId);
      setItems(data.map(toFeedItem));

      // 2. Classify with selected engine (with fallback & timeout prompt)
      await runClassification(text);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to post message.");
    }
  };

  const confirmDetectedAction = (detected, originalText) => {
    if (!detected) return;
    if (detected.category === "task") {
      navigate("/advisor/group-tasks", {
        state: {
          prefillTask: {
            title: detected.title || "Task",
            description: originalText,
            completion_modes: detected.completion_modes || ["form", "mark_done"],
            due: detected.due || "",
            category: "task",
          },
          originalMessage: originalText,
        },
      });
    } else if (detected.category === "drive") {
      navigate("/advisor/placements", {
        state: {
          prefillDrive: {
            company: detected.drive_company || "Placement Drive",
            role: detected.drive_role || "On-campus Drive",
            package: detected.drive_package || "",
            deadline: detected.due || "",
          },
          originalMessage: originalText,
        },
      });
    }
  };

  return (
    <AppShell title="Group Messaging" subtitle="Class Advisor View — Class Students Group & HOD Circle">
      {/* Real-time Ollama Detection & Timeout Alert Banner */}
      {detectBanner && (
        <div style={{
          marginBottom: 16,
          padding: "14px 18px",
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
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {detectBanner.status === "analyzing" && <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} color="var(--accent-blue)" />}
            {detectBanner.status === "task" && <ClipboardList size={18} color="#6366f1" />}
            {detectBanner.status === "drive" && <Briefcase size={18} color="#10b981" />}
            {detectBanner.status === "general" && <CheckCircle2 size={18} color="#6b7280" />}

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-hi)" }}>
                  {detectBanner.message}
                </span>
                {detectBanner.engineLabel && (
                  <span style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: detectBanner.isLocal ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)",
                    color: detectBanner.isLocal ? "#d97706" : "#6366f1",
                    fontWeight: 600,
                    border: `1px solid ${detectBanner.isLocal ? "rgba(245, 158, 11, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
                  }}>
                    {detectBanner.engineLabel}
                  </span>
                )}
              </div>
              {detectBanner.text && (
                <div style={{ fontSize: 11.5, color: "var(--text-mid)", marginTop: 2 }}>
                  Message: <em>"{detectBanner.text}"</em>
                </div>
              )}
              {detectBanner.detected?.notice && (
                <div style={{ fontSize: 11, color: "var(--text-lo)", marginTop: 2, fontStyle: "italic" }}>
                  ℹ️ {detectBanner.detected.notice}
                </div>
              )}
            </div>

            {/* Confirm / Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {detectBanner.isLocal && detectBanner.status !== "analyzing" && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => runClassification(detectBanner.text, "ollama")}
                  title="Force re-run specifically using Ollama model"
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                >
                  <RefreshCw size={12} /> Retry Ollama
                </button>
              )}
              {(detectBanner.status === "task" || detectBanner.status === "drive") && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => confirmDetectedAction(detectBanner.detected, detectBanner.text)}
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                >
                  Confirm & Create {detectBanner.status === "task" ? "Task" : "Drive"} <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Interactive Timeout Prompt: Ask the user if we can switch to local model */}
          {detectBanner.status === "analyzing" && detectBanner.showTimeoutPrompt && (
            <div style={{
              marginTop: 4,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px dashed rgba(245, 158, 11, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Clock size={16} color="#d97706" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-hi)" }}>
                  Ollama timeout reached / taking time. Can we use the local model?
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ background: "#d97706", borderColor: "#b45309", fontSize: 11.5, display: "flex", alignItems: "center", gap: 4 }}
                  onClick={() => runClassification(detectBanner.text, "local")}
                >
                  <Zap size={13} /> Yes, Use Local Model
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11.5 }}
                  onClick={() => setDetectBanner((b) => ({ ...b, showTimeoutPrompt: false }))}
                >
                  Wait for Ollama
                </button>
              </div>
            </div>
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
          {/* Classification Engine Controller */}
          <GlassCard style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Cpu size={14} /> Classification Engine
              </span>
              <span style={{ fontSize: 10.5, color: "var(--accent-blue)", fontWeight: 600 }}>
                {engineMode === "auto" ? "Ollama + Fallback" : engineMode === "ollama" ? "Strict Ollama" : "Fast Local Words"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-lo)", margin: "0 0 12px", lineHeight: 1.5 }}>
              Choose whether to classify announcements via the active Ollama model or the local words-based classifier.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
              <button
                className={`btn btn-sm ${engineMode === "auto" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 11, padding: "6px 4px", textAlign: "center" }}
                onClick={() => setEngineMode("auto")}
              >
                🤖 Auto
              </button>
              <button
                className={`btn btn-sm ${engineMode === "ollama" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 11, padding: "6px 4px", textAlign: "center" }}
                onClick={() => setEngineMode("ollama")}
              >
                ✨ Ollama
              </button>
              <button
                className={`btn btn-sm ${engineMode === "local" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 11, padding: "6px 4px", textAlign: "center" }}
                onClick={() => setEngineMode("local")}
              >
                ⚡ Local
              </button>
            </div>

            {/* Test Classifier Sandbox */}
            <div style={{ paddingTop: 10, borderTop: "1px solid var(--glass-border)" }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-hi)", marginBottom: 6 }}>
                Test Classifier Sandbox
              </div>
              <input
                className="field-input"
                style={{ fontSize: 12, marginBottom: 8 }}
                placeholder="e.g. Wipro campus drive 5.6 LPA on Friday"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && testText.trim()) {
                    runClassification(testText.trim());
                  }
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, fontSize: 11 }}
                  disabled={!testText.trim() || classifying}
                  onClick={() => runClassification(testText.trim())}
                >
                  Test ({engineMode})
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11 }}
                  disabled={!testText.trim() || classifying}
                  onClick={() => runClassification(testText.trim(), "local")}
                  title="Run instantly with words-based local classifier"
                >
                  <Zap size={12} /> Local
                </button>
              </div>
            </div>
          </GlassCard>

          {/* Active Classification Details */}
          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Last Message Classification</span>
            <p style={{ fontSize: 12, color: "var(--text-lo)", margin: "8px 0 12px", lineHeight: 1.6 }}>
              Latest analysis result and detected attributes from group announcements.
            </p>
            {classifying && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, color: "var(--accent-blue)", fontSize: 12 }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>Running classification with {engineMode}…</span>
              </div>
            )}
            {!classifying && classification && (
              <div style={{ padding: 12, borderRadius: 12, background: "var(--bg-3)", border: "1px solid var(--glass-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>{classification.title}</strong>
                  <span className={`pill ${classification.category === "task" ? "pill-blue" : classification.category === "drive" ? "pill-green" : ""}`}>
                    {classification.category}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-mid)", margin: "8px 0" }}>{classification.summary}</p>
                
                {/* Attributes breakdown */}
                {classification.detected?.drive_company && (
                  <div style={{ fontSize: 11, color: "var(--text-hi)", margin: "4px 0" }}>
                    💼 Company: <strong>{classification.detected.drive_company}</strong>
                    {classification.detected.drive_package ? ` · ${classification.detected.drive_package}` : ""}
                  </div>
                )}
                {classification.detected?.completion_modes && (
                  <div style={{ fontSize: 11, color: "var(--text-lo)", margin: "4px 0" }}>
                    Modes: {classification.detected.completion_modes.join(", ")}
                  </div>
                )}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                    {classification.engine === "local_rules" ? "⚡ Local Keywords" : "✨ Ollama LLM"} · {classification.model}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 10.5, padding: "2px 6px" }}
                    onClick={() => runClassification(classification.title, classification.engine === "local_rules" ? "ollama" : "local")}
                  >
                    Switch engine
                  </button>
                </div>
              </div>
            )}
            {!classifying && !classification && (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-2)", fontSize: 12, color: "var(--text-lo)", textAlign: "center" }}>
                Send a message in the chat feed to see real-time classification.
              </div>
            )}
          </GlassCard>

          {/* Agent Instruction */}
          <GlassCard style={{ padding: 18 }}>
            <span className="eyebrow">Agent instructions</span>
            <p style={{ fontSize: 12, color: "var(--text-lo)", margin: "8px 0 12px", lineHeight: 1.6 }}>
              Guide how your class agent should act on new group messages — editable any time.
            </p>
            <textarea
              className="field-input"
              rows={4}
              style={{ resize: "vertical" }}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: "100%" }}>
              Save instruction
            </button>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}

