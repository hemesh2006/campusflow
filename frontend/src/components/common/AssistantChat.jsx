import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Sparkles, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { sendAssistantMessage, getAssistantHistory } from "../../api/assistant";
import { renderAssistantText } from "../../lib/richText";

function RobotAvatar({ talking }) {
  return (
    <div className="assistant-avatar">
      <Bot size={16} />
      {talking && (
        <span className="assistant-avatar-pulse" aria-hidden="true">
          <span /><span /><span />
        </span>
      )}
    </div>
  );
}

function timeLabel(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function AssistantChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef(null);

  const greeting = () => [
    { from: "bot", text: `Hi **${user.name.split(" ")[0]}**, I'm your personal CampusFlow agent, running on your admin's selected local model. Tell me what you're trying to get done, or ask about your status.` },
  ];

  // Resume: on first open, pull this user's recent action-log entries
  // back from the backend (backed by user_action.json) so the
  // conversation picks up where it left off instead of resetting on
  // every reload — each turn is a step the agent already completed.
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    getAssistantHistory(20)
      .then((records) => {
        const rehydrated = records.flatMap((r) => {
          const turns = [{ from: "user", text: r.message, at: r.created_at }];
          if (r.status === "completed" && r.response) {
            turns.push({ from: "bot", text: r.response, at: r.updated_at });
          } else if (r.status === "error") {
            turns.push({ from: "bot", text: r.response || "Something went wrong reaching the model.", at: r.updated_at, error: true });
          } else if (r.status === "in_progress") {
            turns.push({ from: "bot", text: "*This request was interrupted before finishing — send it again.*", at: r.updated_at, error: true });
          }
          return turns;
        });
        setMessages(rehydrated.length ? rehydrated : greeting());
      })
      .catch(() => setMessages(greeting()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, historyLoaded]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking, open]);

  const send = async () => {
    const text = draft.trim();
    if (!text || thinking) return;

    const historyForModel = messages
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text }));

    setMessages((m) => [...m, { from: "user", text, at: new Date().toISOString() }]);
    setDraft("");
    setThinking(true);
    try {
      const res = await sendAssistantMessage(text, historyForModel);
      setMessages((m) => [...m, { from: "bot", text: res.response, at: res.created_at }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { from: "bot", text: err.message || "Couldn't reach the assistant — check the backend and Ollama are running.", error: true },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <button className="assistant-fab" onClick={() => setOpen((o) => !o)} aria-label="Open assistant">
        {open ? <X size={20} /> : <Bot size={20} />}
      </button>

      {open && (
        <div className="assistant-panel glass">
          <div className="assistant-header">
            <RobotAvatar talking={thinking} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Your assistant</div>
              <div style={{ fontSize: 11, color: "var(--text-lo)" }}>Personal agent · live on your local model</div>
            </div>
            <Sparkles size={14} color="var(--accent-violet)" />
          </div>

          <div className="assistant-body scrollbar-thin" ref={scrollRef}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`assistant-bubble-row ${m.from === "user" ? "assistant-bubble-row-user" : ""}`}
              >
                {m.from === "bot" && <RobotAvatar />}
                <div style={{ display: "flex", flexDirection: "column", maxWidth: "78%", alignItems: m.from === "user" ? "flex-end" : "flex-start" }}>
                  <div
                    className={`assistant-bubble ${m.from === "user" ? "assistant-bubble-user" : "assistant-bubble-bot"} ${m.error ? "assistant-bubble-error" : ""}`}
                  >
                    {m.error && <AlertCircle size={12} style={{ marginRight: 5, verticalAlign: -1 }} />}
                    {renderAssistantText(m.text)}
                  </div>
                  {m.at && <div className="assistant-meta">{timeLabel(m.at)}</div>}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="assistant-bubble-row">
                <RobotAvatar talking />
                <div className="assistant-bubble assistant-bubble-bot assistant-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <div className="assistant-composer">
            <input
              className="field-input"
              placeholder="Ask about tasks, deadlines, status…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              disabled={thinking}
            />
            <button className="btn btn-primary btn-sm" onClick={send} aria-label="Send" disabled={thinking}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
