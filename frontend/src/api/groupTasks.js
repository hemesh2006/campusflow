import { api } from "./client";

// ── Student: list group tasks for their class ──────────────────────────────
export const listGroupTasks = (group) =>
  api.get("/group-tasks", group ? { group } : undefined);

// ── Advisor: list all their group tasks with completion counts ─────────────
export const listAdvisorGroupTasks = () => api.get("/advisor/group-tasks");

// ── Task detail ────────────────────────────────────────────────────────────
export const getGroupTask = (id) => api.get(`/group-tasks/${id}`);

// ── Advisor: create group task manually ───────────────────────────────────
export const createGroupTask = (payload) => api.post("/group-tasks", payload);

// ── Advisor: update task (title, due, status, completion_modes) ────────────
export const updateGroupTask = (id, patch) => api.patch(`/group-tasks/${id}`, patch);

// ── Advisor: set due date for a task that didn't have one ─────────────────
export const setGroupTaskDue = (id, due) =>
  api.patch(`/group-tasks/${id}/due`, { due });

// ── Advisor: delete a group task ──────────────────────────────────────────
export const deleteGroupTask = (id) => api.del(`/group-tasks/${id}`);

// ── Advisor: see per-student completion status ────────────────────────────
export const getGroupTaskCompletions = (id) =>
  api.get(`/group-tasks/${id}/completions`);

// ── Student: complete a task (text / upload / form / mark_done) ───────────
export const completeGroupTask = (id, { mode, text_response, upload_url, form_data }) =>
  api.post(`/group-tasks/${id}/complete`, { mode, text_response, upload_url, form_data });

// ── AI intent detection via Ollama (task vs drive vs general) ──────────────
export const detectGroupTaskIntent = (text, group, options = {}) =>
  api.post("/group-tasks/detect", {
    text,
    group,
    engine: options.engine || "auto",
    timeout: options.timeout || 3.5,
    model: options.model,
  });

