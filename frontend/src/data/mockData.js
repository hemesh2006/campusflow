// ============================================================
// System constants & metadata (roles, departments, node types)
// All mock data arrays have been completely removed.
// ============================================================

export const ROLES = {
  ADMIN: "admin",
  PRINCIPAL: "principal",
  HOD: "hod",
  ADVISOR: "advisor",
  STUDENT: "student",
};

export const ROLE_META = {
  [ROLES.ADMIN]: { label: "Admin", color: "var(--role-admin)", scope: "Institution — full access" },
  [ROLES.PRINCIPAL]: { label: "Principal", color: "var(--role-principal)", scope: "Institution — oversight" },
  [ROLES.HOD]: { label: "Dept. HOD", color: "var(--role-hod)", scope: "Department scope" },
  [ROLES.ADVISOR]: { label: "Class Advisor", color: "var(--role-advisor)", scope: "Class scope" },
  [ROLES.STUDENT]: { label: "Student", color: "var(--role-student)", scope: "Personal scope" },
};

export function resolveRoleFromEmail(email = "") {
  if (email.toLowerCase() === "admin@campusflow.edu") return ROLES.ADMIN;
  return ROLES.STUDENT;
}

export const DEPARTMENTS = ["AI & DS", "CSE", "ECE", "Mechanical", "Civil", "IT"];

export const NODE_TYPES = {
  student: { color: "var(--role-student)", label: "Student node" },
  teacher: { color: "var(--role-hod)", label: "Teacher node" },
  advisor: { color: "var(--role-advisor)", label: "Advisor node" },
  admin: { color: "var(--role-admin)", label: "Management node" },
  agent: { color: "var(--accent-cyan)", label: "Agent node" },
  attendance: { color: "#5ecbe0", label: "Attendance node" },
  message: { color: "#f5b84e", label: "Message-completion node" },
};
