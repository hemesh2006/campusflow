import { api } from "./client";

/** Live CPU / GPU / RAM metrics (admin only) */
export const getSystemStats = () => api.get("/system/stats");

/**
 * Live agent node counts: { total, running, idle, stopped,
 * capacity_used_pct, max_agents, per_user_limit, per_hod_limit }
 */
export const getSystemNodes = () => api.get("/system/nodes");

/**
 * GET  -> { max_agents, per_user_limit, per_hod_limit }
 * PATCH body -> partial update of the same fields
 */
export const getSystemSettings = () => api.get("/system/settings");
export const patchSystemSettings = (patch) => api.patch("/system/settings", patch);
