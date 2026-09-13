import { api } from "./client";

export const listReports = () => api.get("/reports");
export const fileReport = (payload) => api.post("/reports", payload);
export const updateReportStatus = (id, statusValue) => api.patch(`/reports/${id}`, { status: statusValue });
