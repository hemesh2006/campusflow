import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as authApi from "../api/auth";
import { devLogin as devLoginApi } from "../api/dev";
import { getToken, setToken, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" = we're still checking for an existing session on first mount.
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // If any API call comes back 401, the token is stale/expired — drop
  // the session so the app falls back to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  // On first load, if a token is already stored, ask the backend who
  // we are. The backend is always the source of truth for role/profile.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .fetchMe()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const data = await authApi.login({ email, password });
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async ({ name, email, password, dept }) => {
    const data = await authApi.signup({ name, email, password, dept });
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  // Dev-only bypass — mints a session for an existing seeded user with
  // no password. Only succeeds while the backend has DEV_MODE=true.
  const devLogin = useCallback(async (userId) => {
    const data = await devLoginApi(userId);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  // Keep the in-memory user in sync after a profile edit (e.g. PATCH /users/me).
  const refreshUser = useCallback(async () => {
    const fresh = await authApi.fetchMe();
    setUser(fresh);
    return fresh;
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, signup, devLogin, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
