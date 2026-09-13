import { api } from "./client";

export function login({ email, password }) {
  return api.post("/auth/login", { email, password });
}

export function signup({ name, email, password, dept }) {
  return api.post("/auth/signup", { name, email, password, dept });
}

export function fetchMe() {
  return api.get("/auth/me");
}
