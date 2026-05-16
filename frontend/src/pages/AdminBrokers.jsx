import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Copy, Server, Search, RefreshCcw, CheckCircle2, XCircle, Play, Pause } from "lucide-react";

export default function AdminBrokers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reveal, setReveal] = useState({}); // id -> bool
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/broker-connections")
      .then((r) => setRows(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [load]);

  const copy = (val, label = "Copied") => {
    navigator.clipboard.writeText(val);
    toast.success(label);
  };

  const decide = async (license_key, action) => {
    const reason = action === "decline"
      ? (window.prompt(
          "Decline reason — this message is shown to the client on /app:",
          "Invalid credentials or server. Please re-check and re-link."
        ) || "")
      : "";
    try {
      await api.post(`/admin/broker-connections/${license_key}/${action}`, { reason });
      toast.success(action === "approve" ? "Broker approved" : "Broker declined — client will see the reason");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      (r.client_email || "").toLowerCase().includes(t) ||
      (r.client_username || "").toLowerCase().includes(t) ||
      (r.license_key || "").toLowerCase().includes(t) ||
      (r.broker_server || "").toLowerCase().includes(t) ||
      (r.broker_account || "").toLowerCase().includes(t) ||
      (r.mentor_username || "").toLowerCase().includes(t)
    );
  });

  return (
    <div className="min-h-screen bg-black text-white" data-testid="admin-brokers-page">
      <Header />
      <section className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-10">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => navigate("/admin/dashboard")} className="text-[10px] tracking-[0.3em] uppercase text-white/50 hover:text-[#1E90FF] flex items-center gap-1 mb-2" data-testid="admin-brokers-back">
              <ArrowLeft className="w-3 h-3" /> back to admin
            </button>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Broker <span className="text-[#1E90FF]">connections</span>.
            </h1>
            <p className="text-white/65 text-sm mt-1">
              Full MetaTrader credentials submitted by clients on the Mobile EA. Decrypted — handle with care.
            </p>
          </div>
          <Button onClick={load} disabled={loading} className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-10 px-4 tracking-wide" data-testid="admin-brokers-refresh">
            <RefreshCcw className="w-4 h-4 mr-2" /> {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        <div className="mt-6 ea-glass p-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-white/45 ml-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by client email, username, licence, broker server / account, mentor…"
            className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-white h-10"
            data-testid="admin-brokers-search" />
          <span className="text-[10px] tracking-[0.22em] uppercase text-white/45 pr-3">{filtered.length} of {rows.length}</span>
        </div>

        <div className="mt-6 grid gap-4">
          {filtered.length === 0 && !loading && (
            <div className="ea-glass p-10 text-center text-white/50 text-sm" data-testid="admin-brokers-empty">
              No broker connections yet — clients haven't linked their MT4 / MT5 from the Mobile EA.
            </div>
          )}
          {filtered.map((r, i) => {
            const shown = !!reveal[r.license_key];
            const status = r.status || "configured";
            const statusColor =
              status === "approved" ? "#1E90FF" :
              status === "declined" ? "#FF3B3B" :
              status === "pending_approval" ? "#FFC850" :
              "rgba(255,255,255,0.7)";
            const statusLabel =
              status === "approved" ? "approved" :
              status === "declined" ? "declined" :
              status === "pending_approval" ? "pending server-side approval" :
              status;
            const session = r.ea_session;
            const ses = session?.status;
            return (
              <div key={r.license_key} className="ea-glass p-5 sm:p-6 relative" data-testid={`admin-broker-row-${i}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center border border-[#1E90FF]/55 bg-[#1E90FF]/5 text-[#1E90FF]">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-white font-display text-base font-bold" data-testid={`broker-row-email-${i}`}>{r.client_email}</div>
                      <div className="text-[10px] tracking-[0.22em] uppercase text-white/55">{r.client_username || "—"} · {r.client_contact || "no phone"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1 border" style={{ borderColor: `${statusColor}80`, color: statusColor }} data-testid={`broker-row-status-${i}`}>
                      {r.platform?.toUpperCase()} · {statusLabel}
                    </div>
                    {ses && (
                      <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1 border flex items-center gap-1" style={{ borderColor: ses === "running" ? "#1E90FF80" : "rgba(255,255,255,0.2)", color: ses === "running" ? "#1E90FF" : "rgba(255,255,255,0.55)" }} data-testid={`broker-row-session-${i}`}>
                        {ses === "running" ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        EA {ses}
                      </div>
                    )}
                  </div>
                </div>

                {/* Approve / Decline actions (only when pending) */}
                {status === "pending_approval" && (
                  <div className="mt-4 flex gap-2 flex-wrap" data-testid={`broker-row-actions-${i}`}>
                    <Button onClick={() => decide(r.license_key, "approve")} className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-10 px-4 tracking-wide" data-testid={`broker-approve-${i}`}>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve linking (server-side)
                    </Button>
                    <Button onClick={() => decide(r.license_key, "decline")} className="bg-transparent border border-[#FF3B3B]/70 text-[#FF3B3B] hover:bg-[#FF3B3B]/10 rounded-none h-10 px-4 tracking-wide" data-testid={`broker-decline-${i}`}>
                      <XCircle className="w-4 h-4 mr-2" /> Decline
                    </Button>
                  </div>
                )}
                {status === "declined" && r.decision_reason && (
                  <div className="mt-3 text-[11px] tracking-wide text-[#FF3B3B]/85 border border-[#FF3B3B]/30 bg-[#FF3B3B]/5 px-3 py-2" data-testid={`broker-row-decline-reason-${i}`}>
                    Declined: {r.decision_reason}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
                  <Field label="Mentor" value={`${r.mentor_username || "—"} · ${r.mentor_email || ""}`} />
                  <Field label="EA" value={r.ea_name || "—"} />
                  <Field label="Licence key" value={r.license_key} mono onCopy={() => copy(r.license_key, "Licence copied")} />
                  <Field label="Connected at" value={r.connected_at ? new Date(r.connected_at).toLocaleString() : "—"} />
                  <Field label="Broker server" value={r.broker_server} mono onCopy={() => copy(r.broker_server, "Server copied")} testid={`broker-server-${i}`} />
                  <Field label="Broker account" value={r.broker_account} mono onCopy={() => copy(r.broker_account, "Account copied")} testid={`broker-account-${i}`} />
                  <div className="md:col-span-2">
                    <div className="text-[10px] tracking-[0.22em] uppercase text-white/55 mb-1">Trading style</div>
                    <div
                      className="flex items-center gap-2 text-sm font-bold"
                      style={{
                        color: r.trading_style_risk === "high" ? "#FF3B3B"
                             : r.trading_style_risk === "best" ? "#22C55E"
                             : r.trading_style ? "#1E90FF" : "rgba(255,255,255,0.55)",
                      }}
                      data-testid={`broker-trading-style-${i}`}
                    >
                      {r.trading_style_label || "— (not chosen)"}
                      {r.trading_style_risk === "high" && (
                        <span className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold" style={{ color: "#FF3B3B", border: "1px solid #FF3B3B", backgroundColor: "rgba(255,59,59,0.08)" }}>HIGH RISK</span>
                      )}
                      {r.trading_style_risk === "best" && (
                        <span className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold" style={{ color: "#22C55E", border: "1px solid #22C55E", backgroundColor: "rgba(34,197,94,0.08)" }}>BEST</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* EA session detail */}
                {session && session.pairs && session.pairs.length > 0 && (
                  <div className="mt-4 border border-white/10 p-3" data-testid={`broker-row-pairs-${i}`}>
                    <div className="text-[10px] tracking-[0.22em] uppercase text-white/55 mb-2">
                      Active pairs ({session.pairs.length}) {session.started_at && <span className="text-white/40 ml-2">started {new Date(session.started_at).toLocaleString()}</span>}
                    </div>
                    <div className="space-y-1">
                      {session.pairs.map((p) => (
                        <div key={p.symbol} className="grid grid-cols-12 gap-2 items-center text-xs border-l-2 pl-2 py-1" style={{ borderColor: "#1E90FF80" }}>
                          <div className="col-span-3 font-mono text-white font-bold">{p.symbol}</div>
                          <div className="col-span-3 text-[10px] tracking-[0.18em] uppercase text-[#1E90FF]">{p.direction}</div>
                          <div className="col-span-2 text-[10px] tracking-[0.18em] uppercase text-white/55">{p.platform?.toUpperCase()}</div>
                          <div className="col-span-4 font-mono text-right text-white/75">lot {p.lot_size} · ×{p.max_trades}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="text-[10px] tracking-[0.22em] uppercase text-white/55 mb-1">Broker password (live)</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-black/50 border border-[#FF3B3B]/30 px-3 py-2 font-mono text-sm text-white/95 truncate" data-testid={`broker-password-${i}`}>
                      {shown ? (r.broker_password || "— (could not decrypt)") : "••••••••••••"}
                    </code>
                    <Button onClick={() => setReveal((s) => ({ ...s, [r.license_key]: !s[r.license_key] }))} className="bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none h-10 px-3" data-testid={`broker-password-toggle-${i}`}>
                      {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    {shown && r.broker_password && (
                      <Button onClick={() => copy(r.broker_password, "Password copied")} className="bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none h-10 px-3" data-testid={`broker-password-copy-${i}`}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <Footer />
    </div>
  );
}

const Field = ({ label, value, mono = false, onCopy, testid }) => (
  <div data-testid={testid}>
    <div className="text-[10px] tracking-[0.22em] uppercase text-white/55">{label}</div>
    <div className="flex items-center gap-2 mt-0.5">
      <div className={`text-white/95 truncate ${mono ? "font-mono text-xs sm:text-sm" : ""}`}>{value || "—"}</div>
      {onCopy && value && (
        <button onClick={onCopy} className="text-white/40 hover:text-[#1E90FF] shrink-0">
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </div>
);
