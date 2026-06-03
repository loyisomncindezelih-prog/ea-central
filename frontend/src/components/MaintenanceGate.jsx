import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import Maintenance from "@/pages/Maintenance";

// Wraps the entire app. Polls `/api/maintenance` and blocks every route EXCEPT /admin/*
// so the admin can still reach the dashboard to turn maintenance back off.
export default function MaintenanceGate({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, enabled: false, message: "" });

  useEffect(() => {
    let cancelled = false;
    const fetchState = async () => {
      try {
        const { data } = await api.get("/maintenance");
        if (!cancelled) {
          setState({ loading: false, enabled: !!data.enabled, message: data.message || "" });
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    };
    fetchState();
    const iv = setInterval(fetchState, 30000); // re-check every 30s (covers maintenance flips)
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // Always let admin routes through (so admin can flip the toggle off).
  const isAdminRoute = location.pathname.startsWith("/admin");

  if (state.enabled && !isAdminRoute) {
    return <Maintenance message={state.message} />;
  }
  return children;
}
