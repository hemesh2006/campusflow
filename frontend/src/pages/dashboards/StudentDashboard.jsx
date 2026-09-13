import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap, CheckCircle2, Circle, UsersRound, Rocket, ArrowUpRight,
  Calendar, Bot, Code2, Activity, Trophy, TrendingUp, MessageSquare,
  Mail, MapPin, Cake, Pencil, ChevronRight, Lightbulb,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { GlassCard, ProgressBar } from "../../components/common/Primitives";
import StudyIllustration from "../../components/common/StudyIllustration";
import { useAuth } from "../../context/AuthContext";
import { listTasks } from "../../api/tasks";
import { listAgents } from "../../api/agents";
import { listPlacements } from "../../api/placements";
import { listMessages } from "../../api/messages";
import { api } from "../../api/client";

/* ---------- top stat row — icon-in-circle, not rings ---------- */
function IconStat({ icon: Icon, tone, tint, value, label, sub, subTone }) {
  return (
    <GlassCard style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: tint, color: tone, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon size={21} strokeWidth={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="h-display" style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-hi)", marginTop: 2 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11, color: subTone || "var(--text-lo)", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
            {sub}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

/* ---------- cumulative GPA card ---------- */
function CgpaCard({ student }) {
  const sems = student.semesters || [];
  if (sems.length === 0) {
    return (
      <GlassCard style={{ padding: 22 }}>
        <div style={{ fontSize: 13, color: "var(--text-lo)" }}>No semester GPA on file yet — add it from your Profile page.</div>
      </GlassCard>
    );
  }
  const pct = ((student.cgpa || 0) / 10) * 100;
  const diff = sems.length > 1 ? (sems.at(-1).gpa - sems.at(-2).gpa).toFixed(2) : "0.00";
  const min = Math.min(...sems.map((s) => s.gpa)) - 0.25;
  const max = Math.max(...sems.map((s) => s.gpa)) + 0.25;
  const pts = sems.map((s, i) => {
    const x = sems.length > 1 ? (i / (sems.length - 1)) * 100 : 0;
    const y = 34 - ((s.gpa - min) / (max - min || 1)) * 34;
    return `${x},${y}`;
  }).join(" ");

  return (
    <GlassCard
      style={{
        padding: 22, display: "flex", flexDirection: "column", gap: 18,
        background: "linear-gradient(135deg, #eef0ff, #f7f5ff 55%, #ffffff)",
        border: "1px solid rgba(99,102,241,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
          <circle cx="40" cy="40" r="35" fill="none" stroke="#e4e6fb" strokeWidth="7" />
          <circle
            cx="40" cy="40" r="35" fill="none" stroke="#6366f1" strokeWidth="7"
            strokeDasharray={`${(pct / 100) * 220} 220`} strokeLinecap="round"
            transform="rotate(-90 40 40)"
          />
          <foreignObject x="20" y="20" width="40" height="40">
            <div style={{ width: 40, height: 40, display: "grid", placeItems: "center", color: "#6366f1" }}>
              <GraduationCap size={22} />
            </div>
          </foreignObject>
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-hi)" }}>Cumulative GPA</div>
          <div className="h-display" style={{ fontSize: 34, fontWeight: 800, color: "#312e81", lineHeight: 1.1, marginTop: 2 }}>{student.cgpa ?? "—"}</div>
          <div style={{ fontSize: 12, color: "var(--text-lo)", marginTop: 2 }}>Across {sems.length} semesters</div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-hi)" }}>Semester Trend</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: 2 }}>
            <ArrowUpRight size={12} /> {diff}
          </span>
        </div>
        <svg viewBox="0 0 100 34" width="100%" height="52" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="var(--accent-cyan)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
          {sems.map((s, i) => {
            const x = sems.length > 1 ? (i / (sems.length - 1)) * 100 : 0;
            const y = 34 - ((s.gpa - min) / (max - min || 1)) * 34;
            return <circle key={s.sem} cx={x} cy={y} r="1.9" fill="var(--accent-cyan)" />;
          })}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-lo)", fontWeight: 600 }}>
          {sems.map((s) => <span key={s.sem}>{s.gpa}</span>)}
        </div>
      </div>
    </GlassCard>
  );
}

function SectionHeader({ icon: Icon, tone, title, to }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, background: `${tone}18`, color: tone, display: "grid", placeItems: "center" }}>
          <Icon size={15} />
        </div>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</span>
      </div>
      {to && (
        <Link to={to} style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-blue)", display: "flex", alignItems: "center", gap: 2 }}>
          View All <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

// No dedicated "daily plan" endpoint exists yet — build a reasonable
// stand-in from real tasks (pending/in-progress first) instead of the
// old hardcoded DAILY_PLAN mock. See info.md checklist.
function TodaysPlan({ tasks }) {
  const items = [...tasks]
    .sort((a, b) => (a.status === "done") - (b.status === "done"))
    .slice(0, 5);

  return (
    <GlassCard style={{ padding: 18 }}>
      <SectionHeader icon={Calendar} tone="var(--accent-blue)" title="Today's Plan" to="/student/tasks" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No tasks yet.</p>}
        {items.map((t) => (
          <div key={t.id} style={{ display: "flex", gap: 11, alignItems: "center", padding: "7px 0" }}>
            {t.status === "done"
              ? <div style={{ width: 17, height: 17, borderRadius: "50%", background: "var(--accent-blue)", display: "grid", placeItems: "center", flexShrink: 0 }}><CheckCircle2 size={11} color="#fff" strokeWidth={3} /></div>
              : <Circle size={17} color="var(--text-faint)" style={{ flexShrink: 0 }} />}
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontWeight: 600, width: 90, flexShrink: 0 }}>{t.due}</span>
            <span style={{ fontSize: 12.5, color: t.status === "done" ? "var(--text-lo)" : "var(--text-hi)" }}>{t.title}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

const AGENT_DISPLAY = {
  "Placement Assist": { icon: GraduationCap, tone: "#10b981", status: "Running", statusColor: "#10b981" },
  "Skill Assist Agent": { icon: Code2, tone: "#6366f1", status: "Ready", statusColor: "var(--text-lo)", rename: "Skill Mentor" },
  "Attendance Agent": { icon: UsersRound, tone: "#f59e0b", status: "Monitoring", statusColor: "#f59e0b", rename: "Attendance Bot" },
  "Exam Eligibility Agent": { icon: Activity, tone: "#8b5cf6", status: "Ready", statusColor: "var(--text-lo)" },
};

function YourAgents({ agents }) {
  return (
    <GlassCard style={{ padding: 18 }}>
      <SectionHeader icon={Bot} tone="var(--accent-violet)" title="Your Agents" to="/student/skills" />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {agents.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No agents assigned yet.</p>}
        {agents.slice(0, 3).map((a) => {
          const d = AGENT_DISPLAY[a.name] || { icon: Bot, tone: "var(--accent-blue)", status: a.status, statusColor: "var(--text-lo)" };
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0" }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${d.tone}18`, color: d.tone, display: "grid", placeItems: "center", flexShrink: 0 }}>
                <d.icon size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.rename || a.name}</div>
                <div style={{ fontSize: 11, color: d.statusColor, display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="dot" style={{ background: d.statusColor, width: 5, height: 5 }} /> {d.status}
                </div>
              </div>
              {a.name === "Placement Assist" && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-lo)" }}>{a.accuracy}% match</span>}
              <ChevronRight size={14} color="var(--text-faint)" />
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function TaskCompletionCard({ tasks }) {
  const done = tasks.filter((t) => t.status === "done").length;
  const remaining = tasks.length - done;
  return (
    <GlassCard style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Task Completion — Remaining {remaining}</span>
        <Link to="/student/tasks" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-blue)", display: "flex", alignItems: "center", gap: 2 }}>
          View All <ChevronRight size={13} />
        </Link>
      </div>
      {tasks.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No tasks yet — your agents haven't assigned anything.</p>}
      {tasks.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--glass-border)" }}>
          {t.status === "done"
            ? <div style={{ width: 19, height: 19, borderRadius: "50%", background: "var(--accent-blue)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}><CheckCircle2 size={12} color="#fff" strokeWidth={3} /></div>
            : <Circle size={19} color="var(--text-faint)" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: t.status === "done" ? "var(--text-lo)" : "var(--text-hi)" }}>{t.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 3 }}>
              {t.due} · <span style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>{t.agent}</span>
            </div>
          </div>
        </div>
      ))}
    </GlassCard>
  );
}

const PLACEMENT_STATUS = {
  action_needed: { label: "Action needed", color: "#ef4444", bg: "#fee2e2" },
  applied: { label: "Applied", color: "#6b7280", bg: "#f1f2f6" },
  closed: { label: "Closed", color: "#6b7280", bg: "#f1f2f6" },
};

function PlacementsPreview({ placements }) {
  const open = placements.slice(0, 2);
  return (
    <GlassCard style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(139,92,246,0.12)", color: "var(--accent-violet)", display: "grid", placeItems: "center" }}>
          <Trophy size={15} />
        </div>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>Placements</span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "0 0 12px 39px" }}>Each company kept separate — no mixed message feed</p>
      {open.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)", marginLeft: 39 }}>No placement drives yet.</p>}
      {open.map((d) => {
        const st = PLACEMENT_STATUS[d.status] || PLACEMENT_STATUS.action_needed;
        return (
          <Link key={d.id} to="/student/placements" style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: "1px solid var(--glass-border)" }}>
            <span className="dot" style={{ background: st.color, width: 7, height: 7, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.company}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.deadline}</div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, padding: "3px 9px", borderRadius: 999 }}>{st.label}</span>
            <ChevronRight size={13} color="var(--text-faint)" />
          </Link>
        );
      })}
    </GlassCard>
  );
}

const SKILL_TONES = ["#14b8a6", "#6366f1", "#f59e0b", "#10b981", "#8b5cf6"];

function SkillsPreview({ skills }) {
  return (
    <GlassCard style={{ padding: 18 }}>
      <SectionHeader icon={TrendingUp} tone="var(--accent-cyan)" title="Skills" />
      {skills.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No skill assessments yet.</p>}
      {skills.map((s, i) => (
        <Link key={s.id} to="/student/skills" style={{ display: "block", padding: "7px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: "var(--text-hi)" }}>{s.skill}</span>
            <span style={{ color: "var(--text-lo)", fontWeight: 600 }}>{s.level}%</span>
          </div>
          <ProgressBar value={s.level} color={SKILL_TONES[i % SKILL_TONES.length]} height={5} />
        </Link>
      ))}
    </GlassCard>
  );
}

function CommonGroupPreview({ messages }) {
  return (
    <GlassCard style={{ padding: 18 }}>
      <SectionHeader icon={MessageSquare} tone="var(--accent-blue)" title="Common group" to="/student/group" />
      {messages.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No messages yet.</p>}
      {messages.slice(0, 2).map((m) => (
        <Link key={m.id} to="/student/group" style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "9px 0", borderTop: "1px solid var(--glass-border)" }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(99,102,241,0.1)", color: "var(--accent-blue)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <GraduationCap size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{m.from_name}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>{m.text.slice(0, 40)}</div>
          </div>
        </Link>
      ))}
    </GlassCard>
  );
}

function ProfileCard({ user }) {
  return (
    <GlassCard
      style={{
        padding: 18,
        background: "linear-gradient(160deg, #6366f1, #4338ca)",
        color: "#fff", border: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16 }}>
          {user.name?.[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{user.name}</div>
          <div style={{ fontSize: 11.5, opacity: 0.75 }}>{user.id}</div>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
          <GraduationCap size={13} /> {user.year || "Year not set"} – {user.dept || "Dept not set"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
          <MapPin size={13} /> {user.college || "College not set"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, overflow: "hidden" }}>
          <Mail size={13} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
          <Cake size={13} /> DOB: {user.dob || "Not set"}
        </div>
      </div>

      <Link to="/student/profile" className="btn btn-sm" style={{ width: "100%", marginTop: 14, background: "rgba(255,255,255,0.16)", color: "#fff" }}>
        <Pencil size={13} /> Edit Profile
      </Link>
    </GlassCard>
  );
}

function IllustrationCard() {
  return (
    <GlassCard
      style={{
        padding: 18, textAlign: "center",
        background: "linear-gradient(160deg, #f2effe, #e9e5fd)",
        border: "1px solid rgba(139,92,246,0.14)",
      }}
    >
      <div style={{ height: 120 }}><StudyIllustration /></div>
      <p style={{ fontSize: 13.5, fontWeight: 700, color: "#312e81", marginTop: 10, lineHeight: 1.4 }}>
        "Learn Fast. Build Smart.<br />Win Tomorrow."
      </p>
      <div style={{ width: 34, height: 3, borderRadius: 2, background: "var(--accent-violet)", margin: "8px auto 0" }} />
    </GlassCard>
  );
}

function ProTipCard() {
  return (
    <GlassCard
      style={{
        padding: 16, display: "flex", alignItems: "center", gap: 12,
        background: "linear-gradient(135deg, #e8fbf3, #dcf6ea)",
        border: "1px solid rgba(16,185,129,0.16)",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(16,185,129,0.18)", color: "var(--accent-emerald)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Lightbulb size={17} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#065f46" }}>Pro Tip</div>
        <div style={{ fontSize: 11.5, color: "#0f766e", marginTop: 1 }}>Keep your tasks updated for better agent assistance.</div>
      </div>
      <ChevronRight size={15} color="#0f766e" />
    </GlassCard>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [skills, setSkills] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listTasks(),
      listAgents(),
      listPlacements(),
      api.get("/skills/me"),
      listMessages("CSE-C"),
    ])
      .then(([taskData, agentData, placementData, skillData, messageData]) => {
        if (cancelled) return;
        setTasks(taskData);
        setAgents(agentData);
        setPlacements(placementData);
        setSkills(skillData);
        setMessages(messageData);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load dashboard data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <AppShell title={`👋 Hey, ${user.name.split(" ")[0]}!`} subtitle="Loading your dashboard…">
        <p style={{ fontSize: 13, color: "var(--text-lo)" }}>Loading…</p>
      </AppShell>
    );
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const myAgents = agents.filter((a) => a.role === "student");
  const runningAgents = myAgents.filter((a) => a.status === "running").length;
  const sems = user.semesters || [];
  const diff = sems.length > 1 ? (sems.at(-1).gpa - sems.at(-2).gpa).toFixed(2) : "0.00";

  return (
    <AppShell title={`👋 Hey, ${user.name.split(" ")[0]}!`} subtitle={`${user.year || ""} ${user.dept ? `– ${user.dept}` : ""} ${user.college ? `· ${user.college}` : ""}`}>
      {error && (
        <div style={{ marginBottom: 16, fontSize: 12.5, color: "var(--accent-rose, #dc2626)" }}>{error}</div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <IconStat icon={GraduationCap} tone="#6366f1" tint="rgba(99,102,241,0.12)" value={user.cgpa ?? "—"} label="CGPA" sub={<><ArrowUpRight size={11} /> {diff} vs last sem</>} subTone="var(--accent-emerald)" />
        <IconStat icon={CheckCircle2} tone="#10b981" tint="rgba(16,185,129,0.12)" value={`${done}/${tasks.length}`} label="Tasks complete" sub="this week" />
        <IconStat icon={UsersRound} tone="#14b8a6" tint="rgba(20,184,166,0.12)" value={user.attendance != null ? `${user.attendance}%` : "—"} label="Attendance" sub="semester to date" />
        <IconStat icon={Rocket} tone="#8b5cf6" tint="rgba(139,92,246,0.12)" value={runningAgents} label="Active agents" sub={`of ${myAgents.length} assigned`} />
      </div>

      <div className="grid grid-main-side">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
            <CgpaCard student={user} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <TodaysPlan tasks={tasks} />
              <YourAgents agents={myAgents} />
            </div>
          </div>

          <TaskCompletionCard tasks={tasks} />

          <div className="grid grid-3">
            <PlacementsPreview placements={placements} />
            <SkillsPreview skills={skills} />
            <CommonGroupPreview messages={messages} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ProfileCard user={user} />
          <IllustrationCard />
          <ProTipCard />
        </div>
      </div>
    </AppShell>
  );
}
