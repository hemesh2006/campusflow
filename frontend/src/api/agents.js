import { api } from "./client";

export const listAgents = () => api.get("/agents");
export const createAgent = (agent) => api.post("/agents", agent);
export const setAgentStatus = (id, statusValue) =>
  api.patch(`/agents/${id}/status`, null, { status_value: statusValue });

// { agents: [...], edges: [[fromId, toId], ...] } — edges are computed
// server-side from role/ownership data, not stored.
export const getAgentNetwork = () => api.get("/agents/network");

// File-backed graph (backend/data/agent_graph.json). Returns only the
// subgraph the current user's access_scope allows:
// { generated_at, agents: { "<id>": {name, role, status, ...} }, connections: { "<id>": ["<id>", ...] } }
// Dict-keyed shape (not arrays) — build node/edge lists from
// Object.entries() when feeding this into a graph component.
export const getAgentGraph = () => api.get("/agents/graph");

// Admin-only: the entire persisted graph, unscoped.
export const getAgentGraphFull = () => api.get("/agents/graph/full");
