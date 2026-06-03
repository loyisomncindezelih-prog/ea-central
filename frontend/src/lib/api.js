import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Decode a JWT payload without external deps. Returns null on malformed input.
function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Returns true if the token is missing or has already expired (with 5s skew).
export function isAccessTokenExpired(token) {
  if (!token) return true;
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 < Date.now() - 5000;
}

// Attach access token from localStorage as a fallback (some browsers block 3rd-party cookies).
// If the token is expired we *don't* attach it — the request gets a clean 401 and the
// response interceptor below performs a hard logout.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ea_access_token");
  if (token && !isAccessTokenExpired(token)) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  } else if (token) {
    // expired → wipe it so we stop sending stale credentials
    localStorage.removeItem("ea_access_token");
  }
  return config;
});

// Auto-logout the user on the first 401 after their token expires.
// Avoid bouncing on the /auth/me probe used by AuthProvider on first mount.
let loggingOut = false;
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const url = err?.config?.url || "";
    if (status === 401 && !loggingOut && !url.endsWith("/auth/me") && !url.endsWith("/auth/login")) {
      loggingOut = true;
      try {
        localStorage.removeItem("ea_access_token");
        // Soft redirect — keeps any open modal state intact for a second.
        const onAdmin = window.location.pathname.startsWith("/admin");
        const target = onAdmin ? "/admin" : "/login";
        if (window.location.pathname !== target) {
          // Show a quick toast if sonner is loaded.
          try {
            // eslint-disable-next-line global-require
            const { toast } = require("sonner");
            toast.message(onAdmin
              ? "Session expired — admin auto-logout after 2 hours. Please sign in again."
              : "Session expired — please sign in again.");
          } catch { /* ignore */ }
          setTimeout(() => { window.location.href = target; }, 800);
        }
      } finally {
        setTimeout(() => { loggingOut = false; }, 5000);
      }
    }
    return Promise.reject(err);
  }
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
