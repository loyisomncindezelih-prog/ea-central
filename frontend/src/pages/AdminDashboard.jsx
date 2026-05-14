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
} from "lucide-react";

const TABS = [
  { key: "pending",  label: "Pending",  icon: Clock },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "rejected", label: "Rejected", icon: XCircle },
  { key: "all",      label: "All",      icon: Users },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("pending");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab === "all" ? {} : { status: tab };
      const [u, s] = await Promise.all([
        api.get("/admin/users", { params }),
        api.get("/admin/stats"),
      ]);
      setUsers(u.data);
      setStats(s.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, action) => {
    setActingId(id);
    try {
      await api.post(`/admin/users/${id}/${action}`);
      toast.success(`User ${action}d`);
      await load();
    } catch (err) {
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mt-8 sm:mt-10">
          <StatCard icon={Clock}        label="Pending"  value={stats?.pending  ?? "—"} accent testId="stat-pending" />
          <StatCard icon={CheckCircle2} label="Approved" value={stats?.approved ?? "—"} testId="stat-approved" />
          <StatCard icon={XCircle}      label="Rejected" value={stats?.rejected ?? "—"} testId="stat-rejected" />
          <StatCard icon={Users}        label="Total"    value={stats?.total    ?? "—"} testId="stat-total" />
        </div>

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
                  {u.payment_clicked && (
                    <div className="mt-1 text-[9px] tracking-[0.2em] uppercase text-[#1E90FF] flex items-center gap-1" data-testid={`admin-paid-${u.id}`}>
                      💳 paid · check
                    </div>
                  )}
                </div>
                <div className="md:col-span-2 flex md:justify-end gap-2 flex-wrap">
                  {u.status !== "approved" && (
                    <Button
                      disabled={actingId === u.id || u.role === "admin"}
                      onClick={() => act(u.id, "approve")}
                      className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-9 px-3 text-xs tracking-wide disabled:opacity-50"
                      data-testid={`admin-approve-${u.id}`}
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
