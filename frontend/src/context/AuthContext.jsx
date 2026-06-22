import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = unauth, object = authed
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async ({ email, password }) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data?.requires_2fa) {
      // Caller must show the 2FA challenge UI and then call verify2FA.
      return { requires_2fa: true, challenge_token: data.challenge_token, user_hint: data.user };
    }
    if (data.access_token) localStorage.setItem("ea_access_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const verify2FA = async ({ challenge_token, code }) => {
    const { data } = await api.post("/auth/2fa/verify", { challenge_token, code });
    if (data.access_token) localStorage.setItem("ea_access_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    // Registration no longer auto-logs the user in — admin must approve first.
    return data; // { user, pending: true }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    localStorage.removeItem("ea_access_token");
    setUser(false);
  };

  const updateProfile = async (payload) => {
    const { data } = await api.patch("/auth/profile", payload);
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2FA, register, logout, updateProfile, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { formatApiErrorDetail };
