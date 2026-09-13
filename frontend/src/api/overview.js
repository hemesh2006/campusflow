import { api } from "./client";

// Principal / HOD / Admin — live aggregates computed from real
// users/tasks/agents/messages collections. See backend/app/routers/overview.py
export const listDepartmentsOverview = () => api.get("/overview/departments");
export const getInstitutionSummary = () => api.get("/overview/institution");
export const listStaffActivity = () => api.get("/overview/staff-activity");
export const listCompletionByStudent = () => api.get("/overview/completion-by-student");
