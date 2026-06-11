import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  ShieldCheck,
  Mail,
  Phone,
  CreditCard,
  Webhook,
  Receipt,
  AlertCircle,
  Play,
  Square,
  Unplug,
  Link2,
  Eye,
  EyeOff,
  Copy,
  KeyRound,
  Server as ServerIcon,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";

const TABS = [
  { key: "pending",        label: "Pending",        icon: Clock },
  { key: "proof_uploaded", label: "Proof uploaded", icon: Receipt },
  { key: "approved",       label: "Approved",       icon: CheckCircle2 },
  { key: "rejected",       label: "Rejected",       icon: XCircle },
  { key: "all",            label: "All",            icon: Users },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Hard 2-hour admin session timeout. JWT exp is checked too via the api interceptor,
  // but this client-side timer guarantees the dashboard closes even if the admin tab
  // sits idle and no requests are made.
  useEffect(() => {
    if (user?.role !== "admin") return;
    const HARD_LIMIT_MS = 2 * 60 * 60 * 1000;
    const id = setTimeout(async () => {
      toast.message("Admin session expired — auto-logout after 2 hours.");
      try { await logout(); } catch { /* ignore */ }
      navigate("/admin", { replace: true });
    }, HARD_LIMIT_MS);
    return () => clearTimeout(id);
  }, [user?.role, logout, navigate]);
  const [tab, setTab] = useState("pending");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [yoco, setYoco] = useState(null);
  const [yocoBusy, setYocoBusy] = useState(false);
  const [proofView, setProofView] = useState(null); // { src, filename, email } or null
  const [clientsStatus, setClientsStatus] = useState({ running: [], stopped: [], pending_broker: [], counts: { running: 0, stopped: 0, pending_broker: 0 } });
  const [clientsBusy, setClientsBusy] = useState(false);
  const [clientDetails, setClientDetails] = useState(null);   // license_key currently opened in floating modal
  const [clientDetailsData, setClientDetailsData] = useState(null);
  const [clientDetailsBusy, setClientDetailsBusy] = useState(false);
  const [showBrokerPwd, setShowBrokerPwd] = useState(false);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [maintenance, setMaintenance] = useState({ enabled: false, message: "" });
  const [maintBusy, setMaintBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const refreshClient = useCallback(async (lk) => {
    try {
      const { data } = await api.get(`/admin/clients/${lk}`);
      setClientDetailsData(data);
    } catch { /* ignore */ }
  }, []);

  const onTookTrade = async (symbol, side, lot) => {
    if (!clientDetails) return;
    setTradeBusy(true);
    try {
      await api.post(`/admin/broker-connections/${clientDetails}/signal/instant`, {
        symbol, action: side, final_status: "executing", lot,
      });
      toast.success(`Took ${side} ${symbol} for client — client terminal will show "EA took a trade"`);
      await refreshClient(clientDetails);
      await loadClients();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setTradeBusy(false);
    }
  };

  const onCloseTrade = async (symbol) => {
    if (!clientDetails) return;
    setTradeBusy(true);
    try {
      await api.post(`/admin/broker-connections/${clientDetails}/signal/instant`, {
        symbol, action: "CLOSE", final_status: "closed",
      });
      toast.success(`Closed ${symbol} — client terminal will show "closed by server"`);
      await refreshClient(clientDetails);
      await loadClients();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setTradeBusy(false);
    }
  };

  const openClient = useCallback(async (license_key) => {
    setClientDetails(license_key);
    setClientDetailsData(null);
    setShowBrokerPwd(false);
    setClientDetailsBusy(true);
    try {
      const { data } = await api.get(`/admin/clients/${license_key}`);
      setClientDetailsData(data);
      // Mark "I opened this user" — shows a 5-hour badge in the dashboard buckets.
      api.post(`/admin/clients/${license_key}/mark-opened`).then(() => {
        // Refresh the bucket lists so the 👁 badge appears immediately.
        loadClients();
      }).catch(() => { /* non-fatal */ });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      setClientDetails(null);
    } finally {
      setClientDetailsBusy(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/clients-status");
      setClientsStatus(data);
    } catch { /* ignore */ }
  }, []);

  const loadYoco = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/yoco/status");
      setYoco(data);
    } catch { /* ignore */ }
  }, []);

  const loadMaintenance = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance");
      setMaintenance({ enabled: !!data.enabled, message: data.message || "" });
    } catch { /* ignore */ }
  }, []);

  const toggleMaintenance = async () => {
    const next = !maintenance.enabled;
    if (next && !window.confirm("Turn ON maintenance mode? Every visitor (except /admin/*) will see the 'we're updating' page until you turn it off.")) return;
    setMaintBusy(true);
    try {
      const { data } = await api.post("/admin/maintenance", {
        enabled: next,
        message: maintenance.message || undefined,
      });
      setMaintenance({ enabled: !!data.enabled, message: data.message || "" });
      toast.success(next ? "Maintenance mode ON — site is now blocked." : "Maintenance mode OFF — site is live.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setMaintBusy(false);
    }
  };

  const registerYocoWebhook = async () => {
    if (!window.confirm("Register the Yoco webhook now? This connects ea-central to Yoco's payment.succeeded events.")) return;
    setYocoBusy(true);
    try {
      const { data } = await api.post("/admin/yoco/register-webhook");
      toast.success(`Webhook registered → ${data.webhook_url}`);
      await loadYoco();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setYocoBusy(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // "proof_uploaded" is a virtual tab — backend doesn't have it as a status,
      // it's pending users who already uploaded their proof of payment.
      const backendStatus = tab === "proof_uploaded" ? "pending" : tab;
      const params = backendStatus === "all" ? {} : { status: backendStatus };
      const [u, s] = await Promise.all([
        api.get("/admin/users", { params }),
        api.get("/admin/stats"),
      ]);
      let rows = u.data;
      if (tab === "proof_uploaded") {
        rows = rows.filter((row) => row.has_payment_proof && row.role !== "admin");
      }
      setUsers(rows);
      setStats(s.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const factoryReset = async () => {
    if (resetText !== "DELETE") return;
    setResetBusy(true);
    try {
      const { data } = await api.post("/admin/factory-reset", { confirm: resetText });
      const total = Object.values(data.deleted || {}).reduce((a, b) => a + b, 0);
      toast.success(`Factory reset complete — ${total} records wiped. Starting afresh.`);
      setResetOpen(false);
      setResetText("");
      await Promise.all([load(), loadClients()]);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setResetBusy(false);
    }
  };

  useEffect(() => {
    load();
    loadYoco();
    loadClients();
    loadMaintenance();
    const iv = setInterval(loadClients, 10000); // refresh client status every 10s
    return () => clearInterval(iv);
  }, [load, loadYoco, loadClients, loadMaintenance]);

  const unlinkBroker = async (license_key, email) => {
    if (!window.confirm(`Unlink ${email}'s broker (${license_key})? They will need to re-link a broker before trading again.`)) return;
    setClientsBusy(true);
    try {
      await api.post(`/admin/broker-connections/${license_key}/unlink`);
      toast.success(`Broker unlinked for ${email}`);
      await loadClients();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setClientsBusy(false);
    }
  };

  const decideBroker = async (license_key, decision) => {
    let reason = "";
    if (decision === "decline") {
      reason = window.prompt("Decline reason (shown to client):", "Invalid credentials or server") || "";
      if (!reason) return;
    }
    setClientsBusy(true);
    try {
      await api.post(`/admin/broker-connections/${license_key}/${decision}`, decision === "decline" ? { reason } : {});
      toast.success(`Broker ${decision}d for ${license_key}`);
      await loadClients();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setClientsBusy(false);
    }
  };

  const act = async (id, action) => {
    setActingId(id);
    // Optimistic UI: flip the row's status immediately so the admin sees
    // the change without waiting for a full /admin/users round-trip. Roll back on error.
    const newStatus = action === "approve" ? "approved" : "rejected";
    const previousUsers = users;
    setUsers((rows) => rows.map((u) => (u.id === id ? { ...u, status: newStatus } : u)));
    setStats((s) => {
      if (!s) return s;
      const prev = previousUsers.find((u) => u.id === id)?.status;
      const next = { ...s };
      if (prev === "pending") next.pending = Math.max(0, (next.pending || 0) - 1);
      next[newStatus] = (next[newStatus] || 0) + 1;
      return next;
    });
    try {
      await api.post(`/admin/users/${id}/${action}`);
      toast.success(`User ${action}d`);
      // Refresh in the background for accurate counts — no UI lag.
      load();
    } catch (err) {
      // Roll back optimistic change.
      setUsers(previousUsers);
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white" data-testid="admin-dashboard-page">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">
              <ShieldCheck className="w-3.5 h-3.5" />
              / admin control room
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight mt-3">
              User <span className="text-[#1E90FF]">verification</span>.
            </h1>
            <p className="text-white/60 text-sm mt-2">
              Signed in as <span className="text-white font-mono">{user?.email}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate("/admin/licenses")}
              variant="ghost"
              className="border border-[#1E90FF]/40 text-[#1E90FF] hover:bg-[#1E90FF]/10 rounded-none h-11"
              data-testid="admin-licenses-btn"
            >
              Licences
            </Button>
            <Button
              onClick={() => navigate("/admin/brokers")}
              variant="ghost"
              className="border border-[#1E90FF]/40 text-[#1E90FF] hover:bg-[#1E90FF]/10 rounded-none h-11"
              data-testid="admin-brokers-btn"
            >
              Brokers
            </Button>
            <Button
              onClick={() => navigate("/admin/scans")}
              variant="ghost"
              className="border border-[#1E90FF]/40 text-[#1E90FF] hover:bg-[#1E90FF]/10 rounded-none h-11"
              data-testid="admin-scans-btn"
            >
              Scanner
            </Button>
            <Button
              onClick={() => navigate("/admin/bridge")}
              variant="ghost"
              className="border border-[#1E90FF]/40 text-[#1E90FF] hover:bg-[#1E90FF]/10 rounded-none h-11"
              data-testid="admin-bridge-btn"
            >
              Bridge
            </Button>
            <Button
              onClick={load}
              variant="ghost"
              className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-11"
              data-testid="admin-refresh-btn"
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={async () => {
                await logout();
                navigate("/admin");
              }}
              className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5"
              data-testid="admin-logout-btn"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5 mt-8 sm:mt-10">
          <StatCard icon={Clock}        label="Pending"        value={stats?.pending  ?? "—"} accent testId="stat-pending" />
          <StatCard icon={Receipt}      label="Proof uploaded" value={stats?.proof_uploaded ?? "—"} testId="stat-proof-uploaded" />
          <StatCard icon={CheckCircle2} label="Approved"       value={stats?.approved ?? "—"} testId="stat-approved" />
          <StatCard icon={XCircle}      label="Rejected"       value={stats?.rejected ?? "—"} testId="stat-rejected" />
          <StatCard icon={Users}        label="Total"          value={stats?.total    ?? "—"} testId="stat-total" />
        </div>

        {/* Maintenance mode toggle */}
        <div
          className="mt-6 ea-glass p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6"
          style={{
            borderColor: maintenance.enabled ? "rgba(255,59,59,0.6)" : "rgba(255,255,255,0.10)",
            boxShadow: maintenance.enabled ? "0 0 28px rgba(255,59,59,0.25), inset 0 0 18px rgba(255,59,59,0.08)" : undefined,
          }}
          data-testid="admin-maintenance-card"
        >
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-11 h-11 flex items-center justify-center border"
              style={{
                borderColor: maintenance.enabled ? "rgba(255,59,59,0.6)" : "rgba(30,144,255,0.4)",
                backgroundColor: maintenance.enabled ? "rgba(255,59,59,0.10)" : "rgba(30,144,255,0.10)",
                color: maintenance.enabled ? "#FF3B3B" : "#1E90FF",
              }}
            >
              {maintenance.enabled ? <PowerOff className="w-5 h-5" /> : <Power className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Maintenance mode</div>
              <div
                className="font-display text-lg font-bold"
                style={{ color: maintenance.enabled ? "#FF3B3B" : "#22C55E" }}
                data-testid="admin-maintenance-state"
              >
                {maintenance.enabled ? "SITE IS OFFLINE" : "Site is live"}
              </div>
            </div>
          </div>
          <div className="flex-1 w-full">
            <input
              type="text"
              value={maintenance.message}
              onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))}
              placeholder="Custom maintenance message (optional) — defaults to 'Website is being updated…'"
              className="w-full bg-black/40 border border-white/15 text-white text-xs px-3 py-2 outline-none focus:border-[#1E90FF] rounded-none font-mono"
              data-testid="admin-maintenance-message"
              maxLength={500}
            />
            <p className="text-[10px] text-white/45 mt-1.5 tracking-wide">
              Blocks every visitor on Landing, /signup, /login, /app, /downloads. Admins can still reach /admin/* to flip it back off.
            </p>
          </div>
          <Button
            onClick={toggleMaintenance}
            disabled={maintBusy}
            className={
              maintenance.enabled
                ? "bg-[#22C55E] hover:bg-[#34D67A] text-black font-bold rounded-none h-11 px-5 shrink-0"
                : "bg-[#FF3B3B] hover:bg-[#FF5757] text-white font-bold rounded-none h-11 px-5 shrink-0"
            }
            data-testid="admin-maintenance-toggle"
          >
            {maintBusy ? "..." : maintenance.enabled ? "TURN SITE BACK ON" : "TURN SITE OFF"}
          </Button>
        </div>

        {/* Danger zone — factory reset */}
        <div
          className="mt-4 ea-glass p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6"
          style={{ borderColor: "rgba(255,59,59,0.35)" }}
          data-testid="admin-reset-card"
        >
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-11 h-11 flex items-center justify-center border"
              style={{ borderColor: "rgba(255,59,59,0.6)", backgroundColor: "rgba(255,59,59,0.10)", color: "#FF3B3B" }}
            >
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Danger zone</div>
              <div className="font-display text-lg font-bold text-[#FF3B3B]">Start afresh</div>
            </div>
          </div>
          <p className="flex-1 text-xs text-white/55 leading-relaxed">
            Permanently deletes <span className="text-white font-semibold">every user</span> (mentors &amp; clients),
            all licence keys, EAs, broker connections, scans, trade signals and payment records.
            Your admin account survives. <span className="text-[#FF3B3B] font-semibold">This cannot be undone.</span>
          </p>
          <Button
            onClick={() => { setResetText(""); setResetOpen(true); }}
            className="bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] font-bold rounded-none h-11 px-5 shrink-0 tracking-[0.15em] uppercase text-xs"
            data-testid="admin-reset-open-btn"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete all users
          </Button>
        </div>

        {/* Factory reset confirmation modal */}
        {resetOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => !resetBusy && setResetOpen(false)}
            data-testid="admin-reset-modal"
          >
            <div
              className="ea-glass w-full max-w-md p-6"
              style={{ borderColor: "rgba(255,59,59,0.5)", boxShadow: "0 0 40px rgba(255,59,59,0.2)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 flex items-center justify-center border shrink-0"
                  style={{ borderColor: "rgba(255,59,59,0.6)", backgroundColor: "rgba(255,59,59,0.10)", color: "#FF3B3B" }}
                >
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="font-display text-xl font-bold text-white">Wipe the entire platform?</div>
              </div>
              <p className="text-xs text-white/60 mt-4 leading-relaxed">
                All mentors, clients, licence keys, EAs, broker connections, scans and payment
                records will be <span className="text-[#FF3B3B] font-semibold">permanently deleted</span>.
                Only your admin account remains. Type <span className="font-mono text-white font-bold">DELETE</span> to confirm.
              </p>
              <input
                type="text"
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                placeholder='Type "DELETE" here'
                autoFocus
                className="mt-4 w-full bg-black/40 border border-white/15 text-white text-sm px-3 py-2.5 outline-none focus:border-[#FF3B3B] rounded-none font-mono"
                data-testid="admin-reset-confirm-input"
              />
              <div className="flex gap-3 mt-5">
                <Button
                  onClick={() => setResetOpen(false)}
                  disabled={resetBusy}
                  className="flex-1 bg-transparent hover:bg-white/5 border border-white/20 text-white/80 rounded-none h-11"
                  data-testid="admin-reset-cancel-btn"
                >
                  Cancel
                </Button>
                <Button
                  onClick={factoryReset}
                  disabled={resetBusy || resetText !== "DELETE"}
                  className="flex-1 bg-[#FF3B3B] hover:bg-[#FF5757] text-white font-bold rounded-none h-11 disabled:opacity-40"
                  data-testid="admin-reset-confirm-btn"
                >
                  {resetBusy ? "Wiping…" : "Delete everything"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Client EA status — 3 buckets */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="admin-clients-status">
          <ClientBucket
            tone="green"
            icon={Play}
            label="Running EA"
            count={clientsStatus.counts.running}
            items={clientsStatus.running}
            empty="No clients are running the EA right now."
            testidPrefix="admin-running"
            onSelect={openClient}
            actions={(row) => (
              <Button
                onClick={(e) => { e.stopPropagation(); unlinkBroker(row.license_key, row.email); }}
                disabled={clientsBusy || !row.broker_status}
                className="bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold disabled:opacity-40"
                title={row.broker_status ? "Unlink broker (force-stops EA)" : "No broker on file"}
                data-testid={`admin-unlink-running-${row.license_key}`}
              >
                <Unplug className="w-3 h-3 mr-1" /> Unlink
              </Button>
            )}
          />
          <ClientBucket
            tone="amber"
            icon={Square}
            label="Stopped EA"
            count={clientsStatus.counts.stopped}
            items={clientsStatus.stopped}
            empty="No clients have stopped the EA."
            testidPrefix="admin-stopped"
            onSelect={openClient}
            actions={(row) => (
              row.broker_status === "approved" ? (
                <Button
                  onClick={(e) => { e.stopPropagation(); unlinkBroker(row.license_key, row.email); }}
                  disabled={clientsBusy}
                  className="bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold"
                  data-testid={`admin-unlink-stopped-${row.license_key}`}
                >
                  <Unplug className="w-3 h-3 mr-1" /> Unlink
                </Button>
              ) : null
            )}
          />
          <ClientBucket
            tone="blue"
            icon={Link2}
            label="Pending broker"
            count={clientsStatus.counts.pending_broker}
            items={clientsStatus.pending_broker}
            empty="No brokers waiting for review."
            testidPrefix="admin-pending-broker"
            onSelect={openClient}
            actions={(row) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  onClick={() => decideBroker(row.license_key, "approve")}
                  disabled={clientsBusy}
                  className="bg-[#22C55E]/15 hover:bg-[#22C55E]/30 border border-[#22C55E]/60 text-[#22C55E] rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold"
                  data-testid={`admin-pb-approve-${row.license_key}`}
                >
                  Approve
                </Button>
                <Button
                  onClick={() => decideBroker(row.license_key, "decline")}
                  disabled={clientsBusy}
                  className="bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold"
                  data-testid={`admin-pb-decline-${row.license_key}`}
                >
                  Decline
                </Button>
              </div>
            )}
          />
        </div>

        {/* Yoco config */}
        <section className="ea-glass mt-6 p-5 sm:p-6" data-testid="admin-yoco-card">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center border border-[#1E90FF]/55 bg-[#1E90FF]/5 text-[#1E90FF]">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Yoco payment gateway</div>
                <div className="text-white text-sm">
                  {yoco?.secret_configured ? "Secret key ✓" : "No secret key"} ·{" "}
                  {yoco?.public_key_configured ? "public key ✓" : "no public key"} ·{" "}
                  R{((yoco?.amount_cents || 43900) / 100).toFixed(2)} {yoco?.currency || "ZAR"} ·{" "}
                  <span className={yoco?.webhook_registered ? "text-[#1E90FF]" : "text-[#FFC850]"} data-testid="yoco-webhook-status">
                    {yoco?.webhook_registered ? "webhook registered" : "webhook NOT registered"}
                  </span>
                </div>
                {yoco?.webhook_url && (
                  <code className="text-[10px] text-white/45 font-mono break-all">{yoco.webhook_url}</code>
                )}
              </div>
            </div>
            <Button
              onClick={registerYocoWebhook}
              disabled={yocoBusy || !yoco?.secret_configured}
              className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5 tracking-wide"
              data-testid="yoco-register-webhook-btn"
            >
              <Webhook className="w-4 h-4 mr-2" />
              {yocoBusy ? "Registering…" : (yoco?.webhook_registered ? "Re-register webhook" : "Register webhook with Yoco")}
            </Button>
          </div>
        </section>

        {/* Tabs */}
        <div className="mt-10 flex flex-wrap gap-2 border-b border-white/10 pb-0" data-testid="admin-tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-xs tracking-[0.22em] uppercase transition border-b-2 -mb-px
                ${tab === key
                  ? "text-[#1E90FF] border-[#1E90FF]"
                  : "text-white/55 border-transparent hover:text-white"}`}
              data-testid={`admin-tab-${key}`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {label}
              {stats && key !== "all" && (
                <span className="ml-1 text-[10px] text-white/40">({stats[key] ?? 0})</span>
              )}
            </button>
          ))}
        </div>

        {/* Pending proof approvals banner */}
        {tab === "pending" && users.some((u) => u.has_payment_proof && u.role === "mentor") && (
          <div
            className="mt-6 ea-glass p-4 sm:p-5 border-[#22C55E]/35 bg-[#22C55E]/[0.04]"
            data-testid="admin-pending-proof-banner"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center border border-[#22C55E]/55 bg-[#22C55E]/10 text-[#22C55E]">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] tracking-[0.25em] uppercase text-[#22C55E]">Awaiting your approval</div>
                <div className="text-white text-sm">
                  <span className="font-bold">{users.filter((u) => u.has_payment_proof && u.role === "mentor").length}</span>
                  {" "}mentor{users.filter((u) => u.has_payment_proof && u.role === "mentor").length === 1 ? "" : "s"} uploaded proof of payment — view their proof and approve below.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="mt-6 ea-glass">
          {/* Desktop header */}
          <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[10px] tracking-[0.25em] uppercase text-white/40 border-b border-white/10">
            <div className="col-span-3">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Contact</div>
            <div className="col-span-1">Role</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loading && (
            <div className="px-5 py-10 text-center text-white/40 text-sm" data-testid="admin-loading">
              Loading users…
            </div>
          )}

          {!loading && users.length === 0 && (
            <div className="px-5 py-10 text-center text-white/40 text-sm" data-testid="admin-empty">
              No users to show in this list.
            </div>
          )}

          {!loading &&
            users.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-2 px-5 py-4 border-b border-white/5 hover:bg-white/[0.02] transition"
                data-testid={`admin-user-row-${u.id}`}
              >
                <div className="md:col-span-3">
                  <div className="font-display font-semibold">{u.username}</div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-white/35 mt-0.5">
                    joined {new Date(u.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="md:col-span-3 flex items-center gap-2 text-sm text-white/80 break-all">
                  <Mail className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  {u.email}
                </div>
                <div className="md:col-span-2 flex items-center gap-2 text-sm font-mono text-white/75">
                  <Phone className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  {u.country_code} {u.contact_number}
                </div>
                <div className="md:col-span-1 text-xs tracking-[0.2em] uppercase text-white/70">
                  {u.role}
                </div>
                <div className="md:col-span-1">
                  <StatusBadge status={u.status} />
                  {u.status === "pending" && (
                    u.has_payment_proof ? (
                      <div className="mt-1 text-[9px] tracking-[0.2em] uppercase text-[#22C55E] flex items-center gap-1" data-testid={`admin-proof-uploaded-${u.id}`}>
                        <Receipt className="w-3 h-3" /> proof uploaded
                      </div>
                    ) : (
                      <div className="mt-1 text-[9px] tracking-[0.2em] uppercase text-[#F5C150] flex items-center gap-1" data-testid={`admin-proof-missing-${u.id}`}>
                        <AlertCircle className="w-3 h-3" /> awaiting proof
                      </div>
                    )
                  )}
                  {u.status !== "pending" && u.payment_proof_uploaded_at && (
                    <div className="mt-1 text-[9px] tracking-[0.2em] uppercase text-white/40">
                      proof on file
                    </div>
                  )}
                </div>
                <div className="md:col-span-2 flex md:justify-end gap-2 flex-wrap items-start">
                  {/* Proof preview / view button */}
                  {u.status === "pending" && u.has_payment_proof && u.payment_proof_data_url && (
                    <button
                      onClick={() => setProofView({ src: u.payment_proof_data_url, filename: u.payment_proof_filename, email: u.email, uploadedAt: u.payment_proof_uploaded_at })}
                      className="h-9 w-9 border border-[#1E90FF]/50 hover:border-[#1E90FF] bg-[#1E90FF]/5 flex items-center justify-center overflow-hidden"
                      title="View proof of payment"
                      data-testid={`admin-view-proof-${u.id}`}
                    >
                      {u.payment_proof_data_url.startsWith("data:image/") ? (
                        <img src={u.payment_proof_data_url} alt="proof" className="w-full h-full object-cover" />
                      ) : (
                        <Receipt className="w-4 h-4 text-[#1E90FF]" />
                      )}
                    </button>
                  )}
                  {u.status !== "approved" && (
                    <Button
                      disabled={
                        actingId === u.id ||
                        u.role === "admin" ||
                        (u.status === "pending" && u.role === "mentor" && !u.has_payment_proof)
                      }
                      onClick={() => act(u.id, "approve")}
                      className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-9 px-3 text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid={`admin-approve-${u.id}`}
                      title={u.status === "pending" && u.role === "mentor" && !u.has_payment_proof ? "Waiting for user to upload proof of payment" : "Approve"}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Approve
                    </Button>
                  )}
                  {u.status !== "rejected" && u.role !== "admin" && (
                    <Button
                      disabled={actingId === u.id}
                      onClick={() => act(u.id, "reject")}
                      variant="ghost"
                      className="border border-white/20 hover:border-white/40 text-white/80 rounded-none h-9 px-3 text-xs tracking-wide disabled:opacity-50"
                      data-testid={`admin-reject-${u.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </main>

      {/* Proof of payment lightbox */}
      {proofView && (
        <div
          onClick={() => setProofView(null)}
          className="fixed inset-0 bg-black/92 z-50 flex items-center justify-center p-4 cursor-zoom-out"
          data-testid="admin-proof-lightbox"
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full ea-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-[#1E90FF]">Proof of Payment</div>
                <div className="text-sm text-white">{proofView.email}</div>
                {proofView.uploadedAt && (
                  <div className="text-[11px] text-white/45 font-mono">{new Date(proofView.uploadedAt).toLocaleString()}</div>
                )}
              </div>
              <button onClick={() => setProofView(null)} className="text-white/60 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            {proofView.src.startsWith("data:image/") ? (
              <img src={proofView.src} alt="proof" className="w-full max-h-[70vh] object-contain border border-white/10" />
            ) : (
              <a href={proofView.src} target="_blank" rel="noreferrer" download={proofView.filename || "proof.pdf"} className="inline-flex items-center gap-2 px-4 py-3 border border-[#1E90FF]/50 text-[#1E90FF] hover:bg-[#1E90FF]/10">
                <Receipt className="w-4 h-4" /> Open / download {proofView.filename || "proof.pdf"}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Floating client details modal */}
      {clientDetails && (
        <ClientDetailsModal
          license_key={clientDetails}
          data={clientDetailsData}
          busy={clientDetailsBusy}
          showPwd={showBrokerPwd}
          onTogglePwd={() => setShowBrokerPwd((v) => !v)}
          onClose={() => { setClientDetails(null); setClientDetailsData(null); setShowBrokerPwd(false); }}
          onUnlink={() => { unlinkBroker(clientDetailsData?.broker?.platform ? clientDetails : clientDetails, clientDetailsData?.client?.email); setClientDetails(null); }}
          onTook={onTookTrade}
          onCloseTrade={onCloseTrade}
          tradeBusy={tradeBusy}
        />
      )}

      <Footer />
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, accent = false, testId }) => (
  <div
    className={`ea-glass p-5 ${accent ? "border-[#1E90FF]/40" : ""}`}
    data-testid={testId}
  >
    <div className="flex items-center justify-between">
      <div className="text-[10px] tracking-[0.25em] uppercase text-white/50">{label}</div>
      <Icon className={`w-4 h-4 ${accent ? "text-[#1E90FF]" : "text-white/60"}`} strokeWidth={1.5} />
    </div>
    <div className={`font-display text-3xl font-bold mt-3 tracking-tight ${accent ? "text-[#1E90FF]" : "text-white"}`}>
      {value}
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const map = {
    pending: { label: "Pending", cls: "border-[#1E90FF]/50 text-[#1E90FF] bg-[#1E90FF]/5" },
    approved: { label: "Approved", cls: "border-white/30 text-white bg-white/5" },
    rejected: { label: "Rejected", cls: "border-white/15 text-white/50 bg-white/[0.02]" },
  };
  const m = map[status] || map.approved;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 border ${m.cls} text-[10px] tracking-[0.2em] uppercase`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
};

const TONE_MAP = {
  green: { ring: "#22C55E", glow: "rgba(34,197,94,0.20)", soft: "rgba(34,197,94,0.06)" },
  amber: { ring: "#F5C150", glow: "rgba(245,193,80,0.20)", soft: "rgba(245,193,80,0.06)" },
  blue:  { ring: "#1E90FF", glow: "rgba(30,144,255,0.22)", soft: "rgba(30,144,255,0.06)" },
};

const ClientBucket = ({ tone = "blue", icon: Icon, label, count, items, empty, testidPrefix, actions, onSelect }) => {
  const t = TONE_MAP[tone];
  return (
    <div
      className="ea-glass p-4"
      style={{ borderColor: `${t.ring}55`, backgroundColor: t.soft, boxShadow: `0 0 12px ${t.glow}` }}
      data-testid={`${testidPrefix}-card`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{ border: `1px solid ${t.ring}`, color: t.ring, backgroundColor: `${t.ring}11` }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">{label}</div>
            <div className="font-display text-2xl font-bold" style={{ color: t.ring }} data-testid={`${testidPrefix}-count`}>{count}</div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-[11px] text-white/40 border border-white/8 px-3 py-3 text-center">
            {empty}
          </div>
        ) : items.map((row) => (
          <div
            key={`${row.license_key}-${row.email}`}
            onClick={() => onSelect && onSelect(row.license_key)}
            className="border border-white/8 hover:border-white/30 transition px-2.5 py-2 text-xs cursor-pointer hover:bg-white/[0.03]"
            style={{ borderColor: `${t.ring}22` }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = `${t.ring}66`}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = `${t.ring}22`}
            data-testid={`${testidPrefix}-row-${row.license_key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-white/90 truncate" title={row.email}>{row.email || "—"}</span>
                  {row.opened_by_admin_at && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 border text-[9px] tracking-[0.18em] uppercase font-bold shrink-0"
                      style={{ borderColor: "#1E90FF66", color: "#1E90FF", backgroundColor: "#1E90FF11" }}
                      title={`You opened this user ${timeAgo(row.opened_by_admin_at)} (auto-clears after 5h)`}
                      data-testid={`${testidPrefix}-opened-${row.license_key}`}
                    >
                      <Eye className="w-2.5 h-2.5" /> opened {timeAgo(row.opened_by_admin_at)}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-white/40 truncate">{row.license_key}</div>
              </div>
              {actions && actions(row)}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-white/55 font-mono">
              {row.platform && <span className="border border-white/10 px-1.5 py-0.5">{row.platform.toUpperCase()}</span>}
              {row.account && <span>#{row.account}</span>}
              {row.server  && <span className="truncate max-w-[120px]" title={row.server}>{row.server}</span>}
              {row.trading_style && <span className="text-[#1E90FF]/80">{row.trading_style}</span>}
              {row.status === "declined" && <span className="text-[#FF3B3B]">⚠ declined</span>}
              {row.started_at && <span title={row.started_at}>started {timeAgo(row.started_at)}</span>}
              {row.stopped_at && <span title={row.stopped_at}>stopped {timeAgo(row.stopped_at)}</span>}
              {row.connected_at && !row.started_at && !row.stopped_at && <span title={row.connected_at}>submitted {timeAgo(row.connected_at)}</span>}
            </div>
            {row.stopped_reason && <div className="mt-1 text-[10px] text-white/45">reason: {row.stopped_reason.replace(/_/g, " ")}</div>}
            {row.decision_reason && row.status === "declined" && <div className="mt-1 text-[10px] text-[#FF8A1F]">decline reason: {row.decision_reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

function timeAgo(iso) {
  try {
    const d = new Date(iso);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}



// ============ Floating Client Details Modal ============
const ClientDetailsModal = ({ license_key, data, busy, showPwd, onTogglePwd, onClose, onUnlink, onTook, onCloseTrade, tradeBusy }) => {
  const copy = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      data-testid="admin-client-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl ea-glass relative my-6"
        style={{
          borderColor: "#1E90FF55",
          boxShadow: "0 0 30px rgba(30,144,255,0.25), inset 0 0 16px rgba(30,144,255,0.06)",
          backgroundColor: "rgba(2, 6, 20, 0.95)",
        }}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#1E90FF]">Client</div>
            <div className="font-display text-lg sm:text-xl text-white truncate" data-testid="admin-client-modal-email">
              {data?.client?.username ? `${data.client.username} · ` : ""}
              {data?.client?.email || "—"}
            </div>
            <div className="text-[10px] font-mono text-white/45 truncate">{license_key}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-white/55 hover:text-white" data-testid="admin-client-modal-close">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          {busy && !data && (
            <div className="text-center text-xs text-white/55 py-10">Loading client details…</div>
          )}

          {data && (
            <>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Chip label="License" value={data.license_status} tone={data.license_status === "active" ? "green" : "amber"} />
                <Chip label="EA session" value={data.ea_session?.status || "—"} tone={data.ea_session?.status === "running" ? "green" : "white"} />
                <Chip label="Trading style" value={data.trading_style_label || data.trading_style || "—"} tone="blue" />
                <Chip label="Broker" value={data.broker?.status || "—"} tone={data.broker?.status === "approved" ? "green" : data.broker?.status === "declined" ? "red" : "amber"} />
              </div>

              <Section icon={ServerIcon} label="Broker credentials">
                {!data.broker ? (
                  <div className="text-[12px] text-white/45">No broker linked yet.</div>
                ) : (
                  <div className="space-y-1.5 font-mono text-[12px]">
                    <KV k="Platform" v={(data.broker.platform || "—").toUpperCase()} />
                    <KV k="Server" v={data.broker.server || "—"} onCopy={() => copy(data.broker.server, "Server")} />
                    <KV k="Account" v={data.broker.account || "—"} onCopy={() => copy(data.broker.account, "Account")} accent />
                    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5">
                      <span className="text-[11px] text-white/55 tracking-wide">Password</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-white/90 truncate" data-testid="admin-client-modal-broker-password">
                          {data.broker.password ? (showPwd ? data.broker.password : "•".repeat(Math.min(data.broker.password.length, 14))) : "—"}
                        </span>
                        {data.broker.password && (
                          <>
                            <button onClick={onTogglePwd} className="text-white/55 hover:text-[#1E90FF]" title={showPwd ? "Hide" : "Show"} data-testid="admin-client-modal-broker-password-toggle">
                              {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => copy(data.broker.password, "Password")} className="text-white/55 hover:text-[#1E90FF]" title="Copy">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {data.broker.decision_reason && (
                      <div className="text-[11px] text-[#FF8A1F] pt-1">Decline reason: {data.broker.decision_reason}</div>
                    )}
                  </div>
                )}
              </Section>

              <Section icon={KeyRound} label={`Pairs configured (${data.pair_configs?.length || 0})`}>
                {(data.pair_configs || []).length === 0 ? (
                  <div className="text-[12px] text-white/45">No pairs configured yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    {data.pair_configs.map((p, idx) => {
                      const dirColor = p.direction === "BUY" ? "#22C55E" : p.direction === "SELL" ? "#FF3B3B" : "#9CA3AF";
                      const open = (data.open_positions || {})[p.symbol];
                      return (
                        <div key={idx} className="border border-white/8 px-2.5 py-2 text-xs" style={{ borderColor: open ? "#1E90FF55" : undefined, backgroundColor: open ? "rgba(30,144,255,0.04)" : undefined }}>
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3 font-mono text-white font-bold tracking-wide" data-testid={`admin-client-modal-pair-${idx}`}>{p.symbol}</div>
                            <div className="col-span-2 font-mono text-[11px]" style={{ color: dirColor }}>{p.direction || "BOTH"}</div>
                            <div className="col-span-2 font-mono text-white/65 text-[11px]">{p.lot_size} lot</div>
                            <div className="col-span-5 flex justify-end gap-1 flex-wrap">
                              {open ? (
                                <>
                                  <span
                                    className="px-2 py-1 text-[10px] tracking-[0.18em] uppercase font-bold border"
                                    style={{ color: open.action === "BUY" ? "#22C55E" : "#FF3B3B", borderColor: open.action === "BUY" ? "#22C55E55" : "#FF3B3B55", backgroundColor: open.action === "BUY" ? "rgba(34,197,94,0.10)" : "rgba(255,59,59,0.10)" }}
                                    data-testid={`admin-client-modal-open-${p.symbol}`}
                                  >
                                    Open · {open.action}
                                  </span>
                                  <Button
                                    onClick={() => onCloseTrade && onCloseTrade(p.symbol)}
                                    disabled={tradeBusy}
                                    className="bg-white/10 hover:bg-white/20 border border-white/30 text-white rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold"
                                    data-testid={`admin-client-modal-close-${p.symbol}`}
                                  >
                                    Close
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {(p.direction !== "SELL") && (
                                    <Button
                                      onClick={() => onTook && onTook(p.symbol, "BUY", p.lot_size)}
                                      disabled={tradeBusy}
                                      className="bg-[#22C55E]/15 hover:bg-[#22C55E]/30 border border-[#22C55E]/60 text-[#22C55E] rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold"
                                      data-testid={`admin-client-modal-took-buy-${p.symbol}`}
                                    >
                                      Took BUY
                                    </Button>
                                  )}
                                  {(p.direction !== "BUY") && (
                                    <Button
                                      onClick={() => onTook && onTook(p.symbol, "SELL", p.lot_size)}
                                      disabled={tradeBusy}
                                      className="bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] rounded-none h-7 px-2 text-[10px] tracking-[0.18em] uppercase font-bold"
                                      data-testid={`admin-client-modal-took-sell-${p.symbol}`}
                                    >
                                      Took SELL
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {open && (
                            <div className="text-[10px] text-white/45 font-mono mt-1">
                              opened {timeAgo(open.opened_at)} · {Number(open.lot || 0).toFixed(2)} lot
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section icon={Receipt} label={`Recent trade signals (${data.recent_signals?.length || 0})`}>
                {(data.recent_signals || []).length === 0 ? (
                  <div className="text-[12px] text-white/45">No signals yet.</div>
                ) : (
                  <div className="space-y-1 font-mono text-[11px] max-h-44 overflow-y-auto">
                    {data.recent_signals.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 truncate">
                        <span className="text-white/45">[{new Date(s.created_at).toLocaleTimeString([], { hour12: false })}]</span>
                        <SignalTag status={s.status} />
                        <span className="text-[#1E90FF] font-bold">{s.symbol}</span>
                        <span className="text-white">{s.action}</span>
                        <span className="text-white/60">{Number(s.lot || 0).toFixed(2)} lot</span>
                        {s.error && <span className="text-[#FF3B3B] truncate">· {s.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {data.ea_session?.status && (
                <Section icon={Play} label="EA session">
                  <div className="space-y-1 font-mono text-[12px]">
                    <KV k="Status" v={data.ea_session.status} />
                    <KV k="Trading style" v={data.ea_session.trading_style || "—"} />
                    <KV k="Started" v={data.ea_session.started_at ? new Date(data.ea_session.started_at).toLocaleString() : "—"} />
                    {data.ea_session.stopped_at && <KV k="Stopped" v={new Date(data.ea_session.stopped_at).toLocaleString()} />}
                    {data.ea_session.stopped_reason && <KV k="Reason" v={data.ea_session.stopped_reason.replace(/_/g, " ")} />}
                  </div>
                </Section>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                {data.broker?.status === "approved" && (
                  <Button
                    onClick={onUnlink}
                    className="bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] rounded-none h-10 px-4 text-xs tracking-[0.18em] uppercase font-bold"
                    data-testid="admin-client-modal-unlink"
                  >
                    <Unplug className="w-4 h-4 mr-2" /> Unlink broker
                  </Button>
                )}
                <Button
                  onClick={onClose}
                  className="ml-auto bg-transparent border border-white/20 hover:border-white/40 text-white/85 rounded-none h-10 px-4 text-xs tracking-[0.18em] uppercase"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Section = ({ icon: Icon, label, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-3.5 h-3.5 text-[#1E90FF]" />
      <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">{label}</div>
    </div>
    {children}
  </div>
);

const KV = ({ k, v, accent, onCopy }) => (
  <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5">
    <span className="text-[11px] text-white/55 tracking-wide">{k}</span>
    <div className="flex items-center gap-2 min-w-0">
      <span className={`text-[12px] truncate ${accent ? "text-[#1E90FF] font-bold" : "text-white/90"}`}>{v}</span>
      {onCopy && (
        <button onClick={onCopy} className="text-white/55 hover:text-[#1E90FF]" title="Copy">
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </div>
);

const CHIP_TONES = {
  green: { ring: "#22C55E55", bg: "rgba(34,197,94,0.10)", fg: "#22C55E" },
  amber: { ring: "#F5C15055", bg: "rgba(245,193,80,0.10)", fg: "#F5C150" },
  red:   { ring: "#FF3B3B55", bg: "rgba(255,59,59,0.10)",  fg: "#FF3B3B" },
  blue:  { ring: "#1E90FF55", bg: "rgba(30,144,255,0.10)", fg: "#1E90FF" },
  white: { ring: "rgba(255,255,255,0.15)", bg: "rgba(255,255,255,0.04)", fg: "rgba(255,255,255,0.85)" },
};
const Chip = ({ label, value, tone = "white" }) => {
  const t = CHIP_TONES[tone] || CHIP_TONES.white;
  return (
    <div className="px-2 py-1 text-[10px] tracking-[0.18em] uppercase font-bold" style={{ border: `1px solid ${t.ring}`, color: t.fg, backgroundColor: t.bg }}>
      <span className="text-white/45 font-normal mr-1">{label}</span>
      {String(value || "—")}
    </div>
  );
};

const SIGNAL_TAGS = {
  executed:   { tag: "OK",  color: "#22C55E" },
  closed:     { tag: "CLS", color: "#9CA3AF" },
  failed:     { tag: "ERR", color: "#FF3B3B" },
  low_balance:{ tag: "BAL", color: "#FF8A1F" },
  skipped:    { tag: "SKP", color: "rgba(255,255,255,0.45)" },
  executing:  { tag: "RUN", color: "#1E90FF" },
  pending:    { tag: "PEN", color: "#F5C150" },
};
const SignalTag = ({ status }) => {
  const s = (status || "pending").toLowerCase();
  const t = SIGNAL_TAGS[s] || { tag: s.toUpperCase().slice(0, 3), color: "white" };
  return <span style={{ color: t.color, fontWeight: 800 }}>{t.tag}</span>;
};
