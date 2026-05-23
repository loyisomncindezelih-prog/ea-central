import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, Coins, RefreshCcw, Send, Check, X as XIcon,
  Search, ChevronDown, ChevronUp,
} from "lucide-react";

export default function AdminScans() {
  const navigate = useNavigate();
  const [scans, setScans] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [openImg, setOpenImg] = useState(null);
  const [openCard, setOpenCard] = useState(null);
  const [topupEmail, setTopupEmail] = useState("");
  const [topupPlan, setTopupPlan] = useState("100");
  const [topupCustom, setTopupCustom] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/admin/scans?limit=100").then((r) => setScans(r.data.scans || [])),
      api.get("/admin/scan-purchases").then((r) => setPurchases(r.data.purchases || [])),
    ])
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  const execute = async (s) => {
    if (!s.symbol || !s.direction || !["BUY", "SELL"].includes(s.direction)) {
      toast.error("Scan has no executable direction/symbol.");
      return;
    }
    try {
      await api.post(`/admin/broker-connections/${s.license_key}/signal`, {
        symbol: s.symbol, action: s.direction,
      });
      toast.success(`Pushed ${s.direction} ${s.symbol} to ${s.email}`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const topup = async (e) => {
    e.preventDefault();
    if (!topupEmail) return toast.error("Pick an email");
    const body = topupPlan === "custom"
      ? { plan: "custom", custom_scans: Number(topupCustom) || 0 }
      : { plan: topupPlan };
    try {
      await api.post(`/admin/users/${encodeURIComponent(topupEmail)}/scan-topup`, body);
      toast.success("Top-up applied");
      setTopupEmail("");
      setTopupCustom("");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const approve = async (p) => {
    try {
      await api.post(`/admin/scan-purchases/${p.id}/approve`);
      toast.success(`${p.plan_label} credited to ${p.email}`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const decline = async (p) => {
    const reason = window.prompt("Decline reason:", "Payment proof unclear");
    if (reason === null) return;
    try {
      await api.post(`/admin/scan-purchases/${p.id}/decline`, { reason });
      toast.success("Purchase declined");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const filtered = scans.filter((s) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      (s.email || "").toLowerCase().includes(t) ||
      (s.username || "").toLowerCase().includes(t) ||
      (s.symbol || "").toLowerCase().includes(t) ||
      (s.direction || "").toLowerCase().includes(t)
    );
  });

  const pendingPurchases = purchases.filter((p) => p.status === "pending");

  return (
    <div className="min-h-screen bg-black text-white" data-testid="admin-scans-page">
      <Header />
      <section className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-10">
        <button onClick={() => navigate("/admin/dashboard")} className="text-[10px] tracking-[0.3em] uppercase text-white/50 hover:text-[#1E90FF] flex items-center gap-1 mb-2" data-testid="admin-scans-back">
          <ArrowLeft className="w-3 h-3" /> back to admin
        </button>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          Chart <span className="text-[#1E90FF]">Scanner</span>.
        </h1>
        <p className="text-white/65 text-sm mt-1">
          AI scans submitted by clients · approve token purchases · execute trades on their behalf.
        </p>

        {/* Pending Purchases */}
        <div className="mt-8" data-testid="admin-scans-purchases">
          <h2 className="font-display text-lg uppercase tracking-[0.22em] text-white/80 mb-3">
            Pending purchases <span className="text-[#F5C150] ml-1">{pendingPurchases.length}</span>
          </h2>
          {pendingPurchases.length === 0 ? (
            <div className="text-xs text-white/45 border border-white/10 px-3 py-4">No pending purchases.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingPurchases.map((p) => (
                <div key={p.id} className="border border-[#F5C150]/40 bg-[#F5C150]/5 p-3" data-testid={`admin-scans-purchase-${p.id}`}>
                  <div className="flex items-baseline justify-between">
                    <div className="font-bold text-white">{p.plan_label}</div>
                    <div className="font-mono text-[#F5C150]">R{p.price_zar}.00</div>
                  </div>
                  <div className="text-[11px] text-white/70 mt-0.5">{p.email}</div>
                  <div className="text-[10px] font-mono text-white/40">{p.license_key}</div>
                  {p.proof_data_url && p.proof_data_url.startsWith("data:image/") && (
                    <button onClick={() => setOpenImg(p.proof_data_url)} className="block mt-2 w-full">
                      <img src={p.proof_data_url} alt="proof" className="w-full max-h-32 object-contain border border-white/10" />
                    </button>
                  )}
                  {p.proof_data_url && p.proof_data_url.startsWith("data:application/pdf") && (
                    <a href={p.proof_data_url} target="_blank" rel="noreferrer" className="block mt-2 text-xs text-[#1E90FF] underline">View PDF proof</a>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button onClick={() => approve(p)} className="flex-1 bg-[#22C55E]/15 hover:bg-[#22C55E]/30 border border-[#22C55E]/60 text-[#22C55E] rounded-none h-9 text-xs tracking-[0.18em] uppercase font-bold" data-testid={`admin-scans-approve-${p.id}`}>
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button onClick={() => decline(p)} className="flex-1 bg-[#FF3B3B]/15 hover:bg-[#FF3B3B]/30 border border-[#FF3B3B]/60 text-[#FF3B3B] rounded-none h-9 text-xs tracking-[0.18em] uppercase font-bold" data-testid={`admin-scans-decline-${p.id}`}>
                      <XIcon className="w-3.5 h-3.5 mr-1" /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual Top-up */}
        <div className="mt-10" data-testid="admin-scans-topup">
          <h2 className="font-display text-lg uppercase tracking-[0.22em] text-white/80 mb-3">Manual top-up</h2>
          <form onSubmit={topup} className="grid grid-cols-1 sm:grid-cols-12 gap-2 border border-white/10 p-4 bg-white/5">
            <Input
              placeholder="user@email.com"
              value={topupEmail}
              onChange={(e) => setTopupEmail(e.target.value)}
              className="sm:col-span-5 bg-transparent border-white/20 text-white rounded-none"
              data-testid="admin-scans-topup-email"
              required
            />
            <select
              value={topupPlan}
              onChange={(e) => setTopupPlan(e.target.value)}
              className="sm:col-span-3 bg-transparent border border-white/20 text-white text-sm px-3 h-10 outline-none"
              data-testid="admin-scans-topup-plan"
            >
              <option value="100" className="bg-black">+100 scans</option>
              <option value="unlimited" className="bg-black">Unlimited</option>
              <option value="custom" className="bg-black">Custom</option>
            </select>
            {topupPlan === "custom" && (
              <Input
                placeholder="qty"
                type="number"
                value={topupCustom}
                onChange={(e) => setTopupCustom(e.target.value)}
                className="sm:col-span-2 bg-transparent border-white/20 text-white rounded-none"
                data-testid="admin-scans-topup-custom"
              />
            )}
            <Button type="submit" className="sm:col-span-2 bg-[#1E90FF] hover:bg-[#1E90FF]/85 text-black font-bold rounded-none" data-testid="admin-scans-topup-submit">
              <Coins className="w-4 h-4 mr-1" /> Add
            </Button>
          </form>
        </div>

        {/* Scans list */}
        <div className="mt-10">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="font-display text-lg uppercase tracking-[0.22em] text-white/80 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1E90FF]" /> All scans
            </h2>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 border border-white/20 px-3">
                <Search className="w-4 h-4 text-white/40" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by email / symbol" className="bg-transparent border-0 text-white rounded-none h-9 w-56" data-testid="admin-scans-search" />
              </div>
              <Button onClick={load} disabled={loading} className="bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none h-10">
                <RefreshCcw className="w-4 h-4 mr-2" /> {loading ? "Loading…" : "Refresh"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-xs text-white/45 border border-white/10 px-3 py-4">No scans yet.</div>
            ) : filtered.map((s) => {
              const isOpen = openCard === s.id;
              const dirColor = s.direction === "BUY" ? "#22C55E" : s.direction === "SELL" ? "#FF3B3B" : "#9CA3AF";
              const requested = !!s.execution_requested_at && !s.executed_at;
              return (
                <div key={s.id} className="border border-white/10 bg-white/5" data-testid={`admin-scans-row-${s.id}`}>
                  <div className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-xs">
                    <button onClick={() => setOpenCard(isOpen ? null : s.id)} className="col-span-1 text-white/40 hover:text-white">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <div className="col-span-3 truncate" title={s.email}>{s.email}</div>
                    <div className="col-span-2 font-mono">{s.symbol || "—"} {s.timeframe ? `· ${s.timeframe.toUpperCase()}` : ""}</div>
                    <div className="col-span-2 font-bold" style={{ color: dirColor }}>{s.direction} · {s.confidence}%</div>
                    <div className="col-span-2 text-[10px] text-white/45 font-mono truncate">{new Date(s.created_at).toLocaleString([], { hour12: false })}</div>
                    <div className="col-span-2 flex gap-1 justify-end">
                      {requested && <span className="text-[9px] tracking-[0.18em] uppercase font-bold text-[#F5C150] border border-[#F5C150]/40 px-2 py-1">Verifying</span>}
                      {s.executed_at && <span className="text-[9px] tracking-[0.18em] uppercase font-bold text-[#22C55E] border border-[#22C55E]/40 px-2 py-1">Executed</span>}
                      {(s.direction === "BUY" || s.direction === "SELL") && !s.executed_at && (
                        <Button onClick={() => execute(s)} className="bg-[#1E90FF]/15 hover:bg-[#1E90FF]/30 border border-[#1E90FF]/60 text-[#1E90FF] rounded-none h-8 px-2 text-[10px] tracking-[0.18em] uppercase font-bold" data-testid={`admin-scans-execute-${s.id}`}>
                          <Send className="w-3 h-3 mr-1" /> Execute
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-white/8 px-3 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      {s.image_data_url && s.image_data_url.startsWith("data:image/") && (
                        <button onClick={() => setOpenImg(s.image_data_url)} className="md:col-span-1">
                          <img src={s.image_data_url} alt="chart" className="w-full object-contain border border-white/10 max-h-48" />
                        </button>
                      )}
                      <div className="md:col-span-2 space-y-2 text-xs">
                        <div className="text-white/70">{s.reasoning || "—"}</div>
                        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                          <Cell k="Entry" v={s.entry} />
                          <Cell k="Stop" v={s.stop_loss} />
                          <Cell k="Target" v={s.take_profit} />
                        </div>
                        <div className="text-[10px] text-white/45 font-mono">License: {s.license_key}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Image lightbox */}
      {openImg && (
        <div onClick={() => setOpenImg(null)} className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" data-testid="admin-scans-lightbox">
          <img src={openImg} alt="enlarged" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      <Footer />
    </div>
  );
}

const Cell = ({ k, v }) => (
  <div className="border border-white/8 px-2 py-1">
    <div className="text-[9px] tracking-[0.18em] uppercase text-white/45">{k}</div>
    <div className="text-white/85">{v || "—"}</div>
  </div>
);
