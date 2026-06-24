import { useEffect, useState, useMemo } from "react";
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
  Sparkles,
  Crown,
  GraduationCap,
} from "lucide-react";

const CACHE_KEY = "ea_mentor_stats_cache";

export default function Dashboard() {
  const { user } = useAuth();
  // Hydrate from sessionStorage for instant first paint — feels native-app fast.
  const [stats, setStats] = useState(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(!stats);

  useEffect(() => {
    let cancelled = false;
    // Fetch + revalidate. Stale-while-revalidate pattern keeps the page snappy.
    api.get("/mentor/stats")
      .then((r) => {
        if (cancelled) return;
        setStats(r.data);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(r.data)); } catch { /* ignore */ }
      })
      .catch(() => { /* keep cached stats */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const today = useMemo(() => new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), []);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const usage = stats?.license_usage || { generated: 0, cap: 500 };
  const pctRaw = usage.cap > 0 ? (usage.generated / usage.cap) * 100 : 0;
  const pctLabel = usage.generated > 0 && pctRaw < 1 ? "<1%" : `${Math.round(pctRaw)}%`;
  const barWidth = usage.generated > 0 ? Math.max(2, pctRaw) : 0;

  return (
    <MentorLayout>
      <div data-testid="dashboard-page" className="ea-mobile">
        {/* Greeting strip */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 ea-card-enter">
          <div>
            <div className="text-[10px] sm:text-xs tracking-[0.32em] uppercase text-[#1E90FF] flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> / mentor portal
            </div>
            <h1 className="ea-mobile-display text-3xl sm:text-4xl md:text-5xl text-white leading-[1.05] mt-3" data-testid="dashboard-greeting">
              {greeting}, <span className="text-[#1E90FF]">{user?.username || "mentor"}</span>.
            </h1>
            <p className="text-white/55 text-sm mt-2.5 max-w-xl leading-relaxed">
              Welcome back to <span className="text-white font-semibold">EA-Central</span>.
              {stats && (
                <>
                  {" "}You have{" "}
                  <span className="text-[#1E90FF] font-semibold" data-testid="dashboard-active-count">
                    {stats.active_subscriptions}
                  </span>{" "}
                  active licence{stats.active_subscriptions === 1 ? "" : "s"}.
                </>
              )}
            </p>

            <div
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[#1E90FF] text-[10px] tracking-[0.22em] uppercase font-semibold ea-card"
              data-testid="mentor-id"
            >
              <IdCard className="w-3.5 h-3.5" />
              Mentor ID:{" "}
              <span className="ea-mono">
                {stats?.mentor_id || (loading ? "loading…" : "—")}
              </span>
            </div>
          </div>
          <div className="ea-card rounded-xl px-4 py-3 inline-flex items-center gap-3 self-start md:self-end">
            <Calendar className="w-4 h-4 text-[#1E90FF]" />
            <span className="text-xs ea-mono tracking-wider text-white/85">{today}</span>
          </div>
        </div>

        {/* System banner */}
        <div className="ea-card rounded-xl px-4 py-3 mt-7 flex items-center gap-3 ea-card-enter" style={{ animationDelay: "0.05s" }} data-testid="system-banner">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] ea-pulse-dot" />
          <span className="text-sm">
            <span className="text-white font-semibold">All systems operational</span>
            <span className="text-white/45"> — hosting, licensing engine, and EA delivery are online.</span>
          </span>
        </div>

        {/* Access tier badge — "EA Access Only" vs "EA + Mentorship Access" with upsell */}
        <TierBadge user={user} />

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mt-6">
          {/* License usage */}
          <div className="ea-card-elevated rounded-2xl p-5 sm:p-6 ea-card-enter" style={{ animationDelay: "0.10s" }} data-testid="kpi-license-usage">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">Licence usage</div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1E90FF1A", color: "#1E90FF" }}>
                <KeyRound className="w-4 h-4" strokeWidth={1.8} />
              </div>
            </div>
            <div className="mt-5 flex items-end gap-2">
              {loading ? (
                <div className="h-10 w-20 ea-shimmer rounded-lg" />
              ) : (
                <>
                  <span className="ea-mobile-display text-4xl text-white">{usage.generated}</span>
                  <span className="text-white/35 mb-1.5 ea-mono">/ {usage.cap}</span>
                </>
              )}
            </div>
            <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#1E90FF] transition-all duration-700 rounded-full" style={{ width: `${barWidth}%`, boxShadow: "0 0 12px rgba(30,144,255,0.55)" }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-white/45">
              <span>Generated / max</span>
              <span className="text-[#1E90FF] ea-mono font-semibold">{pctLabel} used</span>
            </div>
            <Link to="/dashboard/generate-key">
              <Button
                className="mt-5 w-full text-black font-bold rounded-xl h-11 tracking-wide ea-tap"
                style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 18px rgba(30,144,255,0.55)" }}
                data-testid="kpi-generate-key-btn"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                Generate Key
              </Button>
            </Link>
          </div>

          {/* Active subs */}
          <div className="ea-card-elevated rounded-2xl p-5 sm:p-6 ea-card-enter" style={{ animationDelay: "0.15s" }} data-testid="kpi-active-subs">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">Active subscriptions</div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)" }}>
                <Users className="w-4 h-4" strokeWidth={1.8} />
              </div>
            </div>
            <div className="mt-5 flex items-end gap-2">
              {loading ? (
                <div className="h-10 w-16 ea-shimmer rounded-lg" />
              ) : (
                <span className="ea-mobile-display text-4xl text-white">{stats?.active_subscriptions ?? 0}</span>
              )}
            </div>
            <div className="mt-3 text-xs text-white/45">Current active EA users</div>
            <Link to="/dashboard/key-stats">
              <Button
                className="mt-7 w-full bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-11 tracking-wide ea-tap text-xs font-semibold tracking-[0.18em] uppercase"
                data-testid="kpi-key-stats-btn"
              >
                View key stats <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Total EAs */}
          <div className="ea-card-elevated rounded-2xl p-5 sm:p-6 ea-card-enter" style={{ animationDelay: "0.20s" }} data-testid="kpi-total-eas">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">Total EAs</div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)" }}>
                <Cpu className="w-4 h-4" strokeWidth={1.8} />
              </div>
            </div>
            <div className="mt-5 flex items-end gap-2">
              {loading ? (
                <div className="h-10 w-16 ea-shimmer rounded-lg" />
              ) : (
                <>
                  <span className="ea-mobile-display text-4xl text-white">{stats?.total_eas ?? 0}</span>
                  <span className="text-white/35 mb-1.5 ea-mono">/ {stats?.ea_limit ?? 3}</span>
                </>
              )}
            </div>
            <div className="mt-3 text-xs text-white/45">All EAs you are licensing</div>
            <Link to="/dashboard/manage-eas">
              <Button
                className="mt-7 w-full bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-11 tracking-wide ea-tap text-xs font-semibold tracking-[0.18em] uppercase"
                data-testid="kpi-manage-eas-btn"
              >
                Manage EAs <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mt-7 text-sm">
          {[
            ["Hosting",          "Online"],
            ["Licensing engine", "Online"],
            ["EA delivery",      "Online"],
          ].map(([k, v], i) => (
            <div
              key={k}
              className="ea-card rounded-xl px-4 py-3 flex items-center justify-between ea-card-enter"
              style={{ animationDelay: `${0.25 + i * 0.04}s` }}
              data-testid={`status-${k.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className="text-white/45 text-[10px] tracking-[0.25em] uppercase font-semibold">{k}</span>
              <span className="inline-flex items-center gap-2 text-[#10B981] text-xs font-semibold">
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

// ===== Access-tier badge + mentorship upsell =====
// Shows "EA Access Only" (amber) or "EA + Mentorship Access" (green/gold) based on the
// user.wants_mentorship flag. When the user is on the base tier we surface a tasteful
// upgrade card: pay an extra R700 to the existing bank details to unlock 1-on-1
// mentorship — no separate flow, admin reconciles the second proof manually.
function TierBadge({ user }) {
  const hasMentorship = !!user?.wants_mentorship;
  const color = hasMentorship ? "#F5C150" : "#1E90FF";
  const Icon = hasMentorship ? Crown : KeyRound;
  const label = hasMentorship ? "EA + Mentorship Access" : "EA Access Only";
  const sub = hasMentorship
    ? "You're on the full tier — direct mentor guidance unlocked."
    : "Base EA copy-trading is active on your account.";

  return (
    <div
      className="mt-3 rounded-2xl px-4 py-4 sm:px-5 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-4 ea-card-enter"
      style={{
        animationDelay: "0.08s",
        border: `1px solid ${color}3D`,
        background: hasMentorship
          ? "linear-gradient(135deg, rgba(245,193,80,0.10) 0%, rgba(0,0,0,0) 70%)"
          : "linear-gradient(135deg, rgba(30,144,255,0.08) 0%, rgba(0,0,0,0) 70%)",
      }}
      data-testid="tier-badge"
    >
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}1A`, color, border: `1px solid ${color}33` }}
        >
          <Icon className="w-5 h-5" strokeWidth={1.7} />
        </div>
        <div>
          <div className="text-[10px] tracking-[0.28em] uppercase text-white/45">Access tier</div>
          <div className="font-display text-lg font-bold text-white tracking-tight">
            <span data-testid="tier-badge-label">{label}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-white/65 flex-1 leading-relaxed">{sub}</p>
      {!hasMentorship && (
        <Link
          to="/upgrade-mentorship"
          className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl text-black font-bold text-xs tracking-[0.12em] uppercase shrink-0"
          style={{ background: "#F5C150", boxShadow: "0 8px 22px rgba(245,193,80,0.45)" }}
          data-testid="tier-upgrade-btn"
        >
          <GraduationCap className="w-4 h-4" /> Upgrade · +R700
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

