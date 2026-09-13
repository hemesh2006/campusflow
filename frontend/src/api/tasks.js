import { api } from "./client";

export const listTasks = () => api.get("/tasks");
export const createTask = (task) => api.post("/tasks", task);
export const updateTask = (id, patch) => api.patch(`/tasks/${id}`, patch);
