import { api } from "./client";

export const listTasks = () => api.get("/tasks");
export const createTask = (task) => api.post("/tasks", task);
export const updateTask = (id, patch) => api.patch(`/tasks/${id}`, patch);
export const deleteTask = (id) => api.del(`/tasks/${id}`);
export const decomposeTask = (id) => api.post(`/tasks/${id}/decompose`);
