import { api } from "./client";

// Only works while the backend has DEV_MODE=true — otherwise the
// backend returns 403 for both of these.
export const listDevUsers = () => api.get("/dev/users", undefined);
export const devLogin = (userId) => api.post(`/dev/login/${userId}`);
