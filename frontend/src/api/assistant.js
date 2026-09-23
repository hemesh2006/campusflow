import { api } from "./client";

// Personal assistant agent — backed by a local Ollama model on the
// backend (see backend/apps/agents/assistant.py). Every call here is
// also written to backend/data/user_action.json for resumability.

export const sendAssistantMessage = (message, history = []) =>
  api.post("/assistant/chat", { message, history });

// Recent action-log entries for the current user — used to rehydrate
// the chat panel so a conversation resumes instead of resetting.
export const getAssistantHistory = (limit = 30) =>
  api.get("/assistant/history", { limit });

// Admin-only — models pulled on the Ollama host + which one is active.
export const getAssistantModels = () => api.get("/assistant/models");

// Admin-only — every agent institution-wide switches to this model.
export const setAssistantModel = (model) => api.post("/assistant/model", { model });

export const classifyMessage = (message) =>
  api.post("/assistant/classify-message", { message });
