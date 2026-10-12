/**
 * Default Agents Catalog for CampusFlow Frontend
 * ==================================================
 * Defines the core multi-agent architecture across the collegiate hierarchy:
 *   - System Core Agents: Orchestration, Notification Routing, Compliance Monitoring
 *   - Student Personal Agents: Placement Readiness, Skill Mentorship, Attendance, Exam Eligibility
 *   - Staff & Governance Agents: Class Advisor Bot (Aadhavan), HOD Coordinator (Mugilan)
 */

export const AGENT_CATEGORIES = {
  SYSTEM: "System Core",
  STUDENT: "Student Personal",
  ADVISOR: "Class Advisory",
  HOD: "Department Governance",
  EXECUTIVE: "Institutional Executive",
};

export const DEFAULT_AGENTS = [
  // ─── System Core Agents ──────────────────────────────────────────────────
  {
    id: "sys-notification-router",
    name: "Notification Router",
    role: "system",
    category: AGENT_CATEGORIES.SYSTEM,
    status: "running",
    accuracy: 99.0,
    hallucination: 0.1,
    tone: "var(--accent-blue, #3b82f6)",
    icon: "Bell",
    description: "Automated routing of urgent college circulars, timetable changes, and cross-department memos.",
    capabilities: [
      "Real-time circular dispatching",
      "Priority-based message queuing",
      "Read receipt tracking & unread reminders",
    ],
    triggers: ["New college circular published", "Urgent emergency broadcast", "Direct message received"],
  },
  {
    id: "sys-compliance-monitor",
    name: "Compliance Monitor",
    role: "system",
    category: AGENT_CATEGORIES.SYSTEM,
    status: "running",
    accuracy: 98.5,
    hallucination: 0.2,
    tone: "var(--accent-rose, #ef4444)",
    icon: "ShieldAlert",
    deadline: "Daily attendance & policy audit active",
    description: "Continuous audit engine verifying attendance thresholds (<75%), semester eligibility, and institutional compliance.",
    capabilities: [
      "Attendance threshold shortfall detection",
      "Automated advisor warning escalations",
      "Semester examination rule verification",
    ],
    triggers: ["Daily roll call finalization", "Attendance falls below 75%", "Semester exam registration opens"],
  },
  {
    id: "agent-manager",
    name: "Workflow Orchestrator",
    role: "system",
    category: AGENT_CATEGORIES.SYSTEM,
    status: "running",
    accuracy: 97.5,
    hallucination: 0.3,
    tone: "var(--accent-violet, #8b5cf6)",
    icon: "Sliders",
    deadline: "Continuous inter-agent coordination",
    description: "Central brain overseeing inter-agent handoffs, multi-step compound student requests, and concurrency balancing.",
    capabilities: [
      "Inter-agent task routing",
      "Compound intent decomposition",
      "Resource allocation and memory management",
    ],
    triggers: ["Compound student request received", "Agent resource threshold reached", "Task dependency completed"],
  },
  {
    id: "teacher-manager",
    name: "Faculty Coordinator",
    role: "system",
    category: AGENT_CATEGORIES.SYSTEM,
    status: "running",
    accuracy: 98.0,
    hallucination: 0.2,
    tone: "var(--accent-amber, #f59e0b)",
    icon: "GraduationCap",
    description: "Balances faculty workload, synchronizes class timetable schedules, and coordinates assignment deadlines.",
    capabilities: [
      "Faculty schedule conflict resolution",
      "Assignment submission deadline balancing",
      "Classroom substitution alerts",
    ],
    triggers: ["Timetable rescheduled", "Simultaneous assignment conflict detected"],
  },

  // ─── Student Personal Agents ─────────────────────────────────────────────
  {
    id: "placement-agent",
    name: "Placement Readiness Agent",
    role: "student",
    category: AGENT_CATEGORIES.STUDENT,
    status: "running",
    accuracy: 96.5,
    hallucination: 0.4,
    tone: "var(--accent-emerald, #10b981)",
    icon: "Briefcase",
    description: "Analyzes student profiles against upcoming campus recruitment drives, ATS-scores resumes, and suggests preparation roadmaps.",
    capabilities: [
      "Resume ATS parser & gap scoring",
      "Drive eligibility validation (CGPA, backlog, attendance)",
      "Technical interview mock questions generator",
    ],
    triggers: ["New placement drive registered", "Resume PDF uploaded", "Eligibility threshold check requested"],
  },
  {
    id: "skill-mentor-agent",
    name: "Skill Assist Agent",
    role: "student",
    category: AGENT_CATEGORIES.STUDENT,
    status: "running",
    accuracy: 97.0,
    hallucination: 0.3,
    tone: "var(--accent-cyan, #06b6d4)",
    icon: "Code2",
    description: "Identifies weak technical topics across coursework, recommends curated learning modules, and tracks skill growth.",
    capabilities: [
      "Personalized technical skill roadmap",
      "Topic-wise coding problem suggestions",
      "Weak area remediation queues",
    ],
    triggers: ["Quiz/test score logged", "New skill added to profile", "Weekly roadmap refresh"],
  },
  {
    id: "attendance-bot-agent",
    name: "Attendance Monitoring Bot",
    role: "student",
    category: AGENT_CATEGORIES.STUDENT,
    status: "running",
    accuracy: 99.5,
    hallucination: 0.1,
    tone: "var(--accent-amber, #f59e0b)",
    icon: "UsersRound",
    description: "Tracks daily class attendance, computes required classes to maintain >75%, and warns of impending condonation risk.",
    capabilities: [
      "Real-time attendance percentage calculator",
      "Bunk/Leave safety margin predictor",
      "Medical leave / On-Duty (OD) document submission guidance",
    ],
    triggers: ["Daily roll call recorded", "Attendance percentage drops", "Leave application filed"],
  },
  {
    id: "exam-eligibility-agent",
    name: "Exam Eligibility Agent",
    role: "student",
    category: AGENT_CATEGORIES.STUDENT,
    status: "running",
    accuracy: 99.0,
    hallucination: 0.1,
    tone: "var(--accent-violet, #8b5cf6)",
    icon: "Activity",
    description: "Audits semester fee clearance, practical exam submissions, and minimum attendance needed for hall ticket generation.",
    capabilities: [
      "Hall ticket eligibility criteria verification",
      "Fee payment status sync",
      "Continuous internal assessment (CIA) mark tracker",
    ],
    triggers: ["Semester exam notification released", "Hall ticket distribution window opens"],
  },

  // ─── Staff & Department Governance Agents ────────────────────────────────
  {
    id: "aadhavan-agent",
    name: "Aadhavan Class Advisor Bot",
    role: "advisor",
    category: AGENT_CATEGORIES.ADVISOR,
    status: "running",
    accuracy: 98.2,
    hallucination: 0.2,
    tone: "var(--role-advisor, #38bdf8)",
    icon: "Users",
    deadline: "Daily roll call by 10:00 AM",
    description: "Assists Class Advisor Aadhavan with daily student roll call, performance auditing, and direct communication.",
    capabilities: [
      "Instant 3-way daily roll call helper (P / A / OD)",
      "Automated attendance shortage warning dispatcher",
      "Class student roster management & CGPA updates",
    ],
    triggers: ["Morning class hour begins", "Student attendance shortage flagged", "Class announcement broadcast"],
  },
  {
    id: "mugilan-agent",
    name: "Mugilan HOD Coordinator",
    role: "hod",
    category: AGENT_CATEGORIES.HOD,
    status: "running",
    accuracy: 98.8,
    hallucination: 0.1,
    tone: "var(--role-hod, #c084fc)",
    icon: "Building2",
    deadline: "Weekly department attendance review",
    description: "Supports Head of Department Mugilan (AI & DS) with faculty coordination, department analytics, and Principal circulars.",
    capabilities: [
      "Department-wide attendance and performance aggregation",
      "Class Advisor coordination and timetable oversight",
      "Executive circular reporting to Principal",
    ],
    triggers: ["Weekly departmental audit", "Class Advisor escalation received", "Principal executive broadcast"],
  },
];

/**
 * Filter agents matching a given user role.
 */
export function getAgentsByRole(role) {
  if (!role) return DEFAULT_AGENTS;
  const normalized = role.toLowerCase();
  if (normalized === "admin") return DEFAULT_AGENTS;
  return DEFAULT_AGENTS.filter(
    (agent) => agent.role === normalized || agent.role === "system"
  );
}

/**
 * Find agent by identifier.
 */
export function getAgentById(agentId) {
  return DEFAULT_AGENTS.find((a) => a.id === agentId) || null;
}

/**
 * Find display configuration by agent name.
 */
export function getAgentByName(name) {
  return DEFAULT_AGENTS.find((a) => a.name.toLowerCase() === name?.toLowerCase()) || null;
}

/**
 * Returns summary counts by status and category.
 */
export function getAgentSummaryMetrics() {
  const total = DEFAULT_AGENTS.length;
  const running = DEFAULT_AGENTS.filter((a) => a.status === "running").length;
  const idle = DEFAULT_AGENTS.filter((a) => a.status === "idle").length;
  const avgAccuracy = Math.round(
    DEFAULT_AGENTS.reduce((acc, a) => acc + (a.accuracy || 0), 0) / total
  );
  return { total, running, idle, avgAccuracy };
}
