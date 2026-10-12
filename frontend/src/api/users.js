import { api } from "./client";

export const getMyProfile = () => api.get("/users/me");
export const updateMyProfile = (patch) => api.patch("/users/me", patch);

// User settings & Preferences
export const getMySettings = () => api.get("/users/me/settings");
export const updateMySettings = (patch) => api.patch("/users/me/settings", patch);

// Hierarchical Structure & Permissions Store
export const getUserHierarchy = () => api.get("/users/hierarchy");
export const syncUserHierarchy = () => api.post("/users/hierarchy/sync");

// Everyone in the system, lightweight — powers @mention search. Open
// to every logged-in role (unlike listUsers(), which is admin-only).
export const listDirectory = () => api.get("/users/directory");

// Advisor / HOD / Admin — students already mapped into the advisor's class
export const listAdvisorStudents = () => api.get("/advisor/students");

// Advisor / HOD / Admin — registered students not yet mapped to any class
export const listUnassignedStudents = () => api.get("/advisor/students/unassigned");

// Advisor — map / unmap an already-registered student to/from the class
export const addStudentToClass = (studentId) => api.post(`/advisor/students/${studentId}/add`);
export const removeStudentFromClass = (studentId) => api.post(`/advisor/students/${studentId}/remove`);

// Legacy — creates a brand-new student account directly (kept for HOD/Admin
// onboarding edge cases; the advisor UI no longer uses this by default)
export const addStudent = (payload) => api.post("/advisor/students", payload);

// Admin only
export const listUsers = () => api.get("/users");
export const deleteUser = (id) => api.del(`/users/${id}`);

// Institutional Hierarchy Assignment APIs
export const listHierarchyCandidates = (targetRole) =>
  api.get(`/users/hierarchy/candidates${targetRole ? `?target_role=${targetRole}` : ""}`);

export const assignPrincipal = (userId) =>
  api.post("/users/hierarchy/assign-principal", { user_id: userId });

export const assignHod = (userId, dept) =>
  api.post("/users/hierarchy/assign-hod", { user_id: userId, dept });

export const assignAdvisor = (userId, dept) =>
  api.post("/users/hierarchy/assign-advisor", { user_id: userId, dept });

export const removeHierarchyRole = (userId) =>
  api.post("/users/hierarchy/remove-role", { user_id: userId });

export const adminUpdateUserRole = (userId, role, dept) =>
  api.patch(`/users/${userId}/role`, { role, dept });

export const updateStudentAcademic = (studentId, { cgpa, attendance }) =>
  api.patch(`/advisor/students/${studentId}/academic`, { cgpa, attendance });

// Attendance System APIs (Class Advisor)
export const getDailyAttendance = (date) =>
  api.get(`/advisor/attendance${date ? `?date=${date}` : ""}`);

export const submitDailyAttendance = ({ date, records }) =>
  api.post("/advisor/attendance", { date, records });

export const sendAttendanceWarning = (studentId) =>
  api.post(`/advisor/students/${studentId}/warn-attendance`);

// Student — view own attendance history & cumulative %
export const getStudentAttendance = () => api.get("/student/attendance");
