import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  KeyRound,
  Users,
  Cpu,
  CheckCircle2,
  IdCard,
  Calendar,
  ArrowRight,
} from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/mentor/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const usage = stats?.license_usage || { generated: 0, cap: 500 };
  const pctRaw = usage.cap > 0 ? (usage.generated / usage.cap) * 100 : 0;
  const pctLabel = usage.generated > 0 && pctRaw < 1 ? "<1%" : `${Math.round(pctRaw)}%`;
  const barWidth = usage.generated > 0 ? Math.max(2, pctRaw) : 0;

  return (
    <MentorLayout>
      <div data-testid="dashboard-page">
        {/* Greeting strip */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ mentor portal</div>
            <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight mt-3" data-testid="dashboard-greeting">
              {greeting}, <span className="text-[#1E90FF]">{user?.username || "mentor"}</span>.
            </h1>
            <p className="text-white/65 text-sm mt-2">
              Welcome to <span className="text-white">EA-Central</span> — all systems running smoothly.
              {stats && <> You have <span className="text-[#1E90FF] font-semibold">{stats.active_subscriptions}</span> active licences.</>}
            </p>

            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 border border-[#1E90FF]/40 bg-[#1E90FF]/5 text-[#1E90FF] text-xs tracking-[0.2em] uppercase" data-testid="mentor-id">
              <IdCard className="w-3.5 h-3.5" />
              Mentor ID: {stats?.mentor_id || "—"}
            </div>
          </div>
          <div className="ea-glass px-4 py-3 inline-flex items-center gap-3 self-start md:self-end">
            <Calendar className="w-4 h-4 text-[#1E90FF]" />
            <span className="text-xs font-mono tracking-wider">{today}</span>
          </div>
        </div>

        {/* System banner */}
        <div className="ea-glass px-4 py-3 mt-8 flex items-center gap-3" data-testid="system-banner">
          <span className="w-2 h-2 rounded-full bg-[#1E90FF] ea-pulse-dot" />
          <span className="text-sm">
            <span className="text-white">All systems operational</span>
            <span className="text-white/50"> — hosting, licensing engine, and EA delivery are online.</span>
          </span>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
          {/* License usage */}
          <div className="ea-glass p-6 border-t-2 border-t-[#1E90FF]" data-testid="kpi-license-usage">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/50">Licence usage</div>
              <KeyRound className="w-4 h-4 text-[#1E90FF]" strokeWidth={1.5} />
            </div>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-display text-4xl font-bold tracking-tight">{usage.generated}</span>
              <span className="text-white/40 mb-1.5">/ {usage.cap}</span>
            </div>
            <div className="mt-4 h-1.5 w-full bg-white/5 overflow-hidden">
              <div className="h-full bg-[#1E90FF] transition-all" style={{ width: `${barWidth}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-white/45">
              <span>Generated out of maximum</span>
              <span className="text-[#1E90FF] font-mono">{pctLabel} used</span>
            </div>
            <Link to="/dashboard/generate-key">
              <Button
                className="mt-5 w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 tracking-wide"
                data-testid="kpi-generate-key-btn"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                Generate Key
              </Button>
            </Link>
          </div>

          {/* Active subs */}
          <div className="ea-glass p-6 border-t-2 border-t-white/30" data-testid="kpi-active-subs">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/50">Active subscriptions</div>
              <Users className="w-4 h-4 text-white/60" strokeWidth={1.5} />
            </div>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-display text-4xl font-bold tracking-tight">
                {stats?.active_subscriptions ?? "—"}
              </span>
            </div>
            <div className="mt-3 text-xs text-white/45">Current active EA users</div>
            <Link to="/dashboard/key-stats">
              <Button
                variant="ghost"
                className="mt-7 w-full bg-transparent border border-white/15 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-11 tracking-wide"
                data-testid="kpi-key-stats-btn"
              >
                View key stats <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Total EAs */}
          <div className="ea-glass p-6 border-t-2 border-t-white/30" data-testid="kpi-total-eas">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/50">Total EAs</div>
              <Cpu className="w-4 h-4 text-white/60" strokeWidth={1.5} />
            </div>
            <div className="mt-5 flex items-end gap-2">
              <span className="font-display text-4xl font-bold tracking-tight">
                {stats?.total_eas ?? "—"}
              </span>
              <span className="text-white/40 mb-1.5">/ {stats?.ea_limit ?? 3}</span>
            </div>
            <div className="mt-3 text-xs text-white/45">All EAs you are licensing</div>
            <Link to="/dashboard/manage-eas">
              <Button
                variant="ghost"
                className="mt-7 w-full bg-transparent border border-white/15 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-11 tracking-wide"
                data-testid="kpi-manage-eas-btn"
              >
                Manage EAs <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 text-sm">
          {[
            ["Hosting", "Online"],
            ["Licensing engine", "Online"],
            ["EA delivery", "Online"],
          ].map(([k, v]) => (
            <div key={k} className="ea-glass px-4 py-3 flex items-center justify-between" data-testid={`status-${k.toLowerCase().replace(/\s+/g, "-")}`}>
              <span className="text-white/55 text-xs tracking-[0.22em] uppercase">{k}</span>
              <span className="inline-flex items-center gap-2 text-[#1E90FF]">
                <CheckCircle2 className="w-4 h-4" />
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MentorLayout>
  );
}
