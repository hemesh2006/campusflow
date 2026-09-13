import { api } from "./client";

export const getSystemStats = () => api.get("/system/stats");
