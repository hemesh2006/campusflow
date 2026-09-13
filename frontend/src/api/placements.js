import { api } from "./client";

export const listPlacements = () => api.get("/placements");
export const createPlacement = (placement) => api.post("/placements", placement);
export const updatePlacement = (id, patch) => api.patch(`/placements/${id}`, patch);
export const deletePlacement = (id) => api.del(`/placements/${id}`);
export const toggleTask = (id, taskIndex, done) =>
  api.patch(`/placements/${id}/tasks/${taskIndex}`, null, { done });
export const completePlacement = (id) => api.post(`/placements/${id}/complete`);
export const listAdvisorPlacementSummary = () => api.get("/placements/advisor/summary");
