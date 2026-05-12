import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  Activity,
  Users,
  TrendingUp,
  Percent,
  Server,
  Copy,
  CheckCircle2,
  Download,
  MonitorDown,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get("/dashboard/summary").then((res) => setData(res.data)).catch(() => {});
  }, []);

  const inviteLink = `https://ea-central.com/r/${(user?.username || "you").toLowerCase()}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white" data-testid="dashboard-page">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12">
        {/* Header strip */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ mentor control room</div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mt-3">
              Welcome, <span className="text-[#1E90FF]">{user?.username || "mentor"}</span>.
            </h1>
            <p className="text-white/60 text-sm mt-2">Your bot status, clients, and trades — at a glance.</p>
          </div>
          <div className="ea-glass px-5 py-3 flex items-center gap-3">
            <Server className="w-4 h-4 text-[#1E90FF]" />
            <span className="text-xs tracking-[0.2em] uppercase text-white/60">Bot</span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1E90FF] ea-pulse-dot" />
              <span className="font-mono text-sm">{data?.bot_status || "—"}</span>
            </span>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
          <Kpi
            icon={Users}
            label="Connected clients"
            value={data?.connected_clients ?? "—"}
            testId="kpi-clients"
          />
          <Kpi
            icon={Activity}
            label="Trades today"
            value={data?.trades_today ?? "—"}
            testId="kpi-trades"
          />
          <Kpi
            icon={Percent}
            label="Win rate"
            value={data ? `${data.win_rate}%` : "—"}
            testId="kpi-winrate"
          />
          <Kpi
            icon={TrendingUp}
            label="Bot uptime"
            value="99.8%"
            testId="kpi-uptime"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
          {/* Recent trades */}
          <div className="lg:col-span-2 ea-glass p-6" data-testid="recent-trades">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-bold tracking-tight">Recent trades</h2>
              <span className="text-[10px] tracking-[0.25em] uppercase text-white/40">live mirror</span>
            </div>
            <div className="divide-y divide-white/5">
              <div className="grid grid-cols-12 text-[10px] tracking-[0.25em] uppercase text-white/40 pb-3">
                <div className="col-span-3">pair</div>
                <div className="col-span-2">side</div>
                <div className="col-span-2">lot</div>
                <div className="col-span-3 text-right">pnl</div>
                <div className="col-span-2 text-right">time</div>
              </div>
              {(data?.recent_trades || []).map((t, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 py-3 text-sm hover:bg-white/[0.02] transition"
                  data-testid={`trade-row-${i}`}
                >
                  <div className="col-span-3 font-mono">{t.pair}</div>
                  <div className="col-span-2 text-xs tracking-widest">
                    <span className={t.side === "BUY" ? "text-[#1E90FF]" : "text-white/80"}>{t.side}</span>
                  </div>
                  <div className="col-span-2 font-mono text-white/70">{t.lot.toFixed(2)}</div>
                  <div className={`col-span-3 text-right font-mono ${t.pnl < 0 ? "text-white/55" : "text-[#1E90FF]"}`}>
                    {t.pnl > 0 ? "+" : ""}
                    {t.pnl.toFixed(2)}
                  </div>
                  <div className="col-span-2 text-right text-white/50 font-mono">{t.time}</div>
                </div>
              ))}
              {!data && (
                <div className="py-10 text-center text-white/40 text-sm">Loading trades…</div>
              )}
            </div>
          </div>

          {/* Invite + profile */}
          <div className="space-y-6">
            <div className="ea-glass p-6" data-testid="invite-card">
              <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF] mb-3">/ invite clients</div>
              <p className="text-sm text-white/65">
                Share this link. Clients install the mobile EA and join your room — no VPS, no terminal.
              </p>
              <div className="mt-4 flex items-center gap-2 border border-white/15 bg-black/40 px-3 py-2">
                <span className="font-mono text-xs text-white/80 truncate flex-1" data-testid="invite-link">
                  {inviteLink}
                </span>
                <Button
                  onClick={copyInvite}
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black rounded-none px-3 h-8"
                  data-testid="invite-copy-btn"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="ea-glass p-6" data-testid="profile-card">
              <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF] mb-3">/ mentor profile</div>
              <Row k="Username" v={user?.username} />
              <Row k="Email" v={user?.email} />
              <Row k="Contact" v={user ? `${user.country_code} ${user.contact_number}` : ""} />
              <Row k="Role" v={user?.role} />
            </div>
          </div>
        </div>

        {/* Downloads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 mt-8 sm:mt-10">
          <div className="ea-glass p-5 sm:p-6" data-testid="dashboard-download-bridge">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
                <MonitorDown className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45">for you (mentor)</div>
                <h3 className="font-display text-base sm:text-lg font-semibold">PC Bot Bridge</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-white/60">
              Pair your trading bot to ea-central. Install once on the PC running your EA.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="#"><Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-10 px-4" data-testid="dl-bridge-win"><Download className="w-4 h-4 mr-2" />Windows</Button></a>
              <a href="#"><Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none h-10 px-4" data-testid="dl-bridge-mac">macOS</Button></a>
              <a href="#"><Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none h-10 px-4" data-testid="dl-bridge-linux">Linux</Button></a>
            </div>
          </div>

          <div className="ea-glass p-5 sm:p-6" data-testid="dashboard-download-mobile">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
                <Smartphone className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45">for your clients</div>
                <h3 className="font-display text-base sm:text-lg font-semibold">Mobile EA app</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-white/60">
              Share the download link with subscribers. They install, add their license, and they're live.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="#"><Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-10 px-4" data-testid="dl-mobile-ios">iOS</Button></a>
              <a href="#"><Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none h-10 px-4" data-testid="dl-mobile-android">Android APK</Button></a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

const Kpi = ({ icon: Icon, label, value, testId }) => (
  <div className="ea-glass p-5" data-testid={testId}>
    <div className="flex items-center justify-between">
      <div className="text-[10px] tracking-[0.25em] uppercase text-white/50">{label}</div>
      <Icon className="w-4 h-4 text-[#1E90FF]" strokeWidth={1.5} />
    </div>
    <div className="font-display text-3xl font-black mt-3 tracking-tight">{value}</div>
  </div>
);

const Row = ({ k, v }) => (
  <div className="flex items-start justify-between py-2 border-b border-white/5 last:border-0">
    <span className="text-[10px] tracking-[0.25em] uppercase text-white/40">{k}</span>
    <span className="text-sm font-mono text-white/85 max-w-[60%] text-right break-all">{v || "—"}</span>
  </div>
);
