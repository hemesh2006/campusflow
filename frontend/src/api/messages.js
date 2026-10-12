import { api } from "./client";

export const listMessages = (group) => api.get("/messages", { group });
export const postMessage = (message) => api.post("/messages", message);
export const listDmThreads = () => api.get("/messages/dm/threads");
export const deleteMessage = (id, scope = "me") => api.del(`/messages/${id}`, { scope });
export const markMessageRead = (id) => api.patch(`/messages/read/${id}`);

// Mirrors the backend's dm_group() — same two user IDs always produce
// the same thread name, whoever's browser computes it.
export const dmGroup = (idA, idB) => "dm-" + [idA, idB].sort().join("-");
