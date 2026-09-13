import { api } from "./client";

export const listMessages = (group) => api.get("/messages", { group });
export const postMessage = (message) => api.post("/messages", message);
export const listDmThreads = () => api.get("/messages/dm/threads");

// Mirrors the backend's dm_group() — same two user IDs always produce
// the same thread name, whoever's browser computes it.
export const dmGroup = (idA, idB) => "dm-" + [idA, idB].sort().join("-");
