import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Copy, Server, Search, RefreshCcw } from "lucide-react";

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

  useEffect(() => { load(); }, [load]);

  const copy = (val, label = "Copied") => {
    navigator.clipboard.writeText(val);
    toast.success(label);
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
                  <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1 border" style={{ borderColor: "#1E90FF80", color: "#1E90FF" }}>
                    {r.platform?.toUpperCase()} · {r.status || "configured"}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
                  <Field label="Mentor" value={`${r.mentor_username || "—"} · ${r.mentor_email || ""}`} />
                  <Field label="EA" value={r.ea_name || "—"} />
                  <Field label="Licence key" value={r.license_key} mono onCopy={() => copy(r.license_key, "Licence copied")} />
                  <Field label="Connected at" value={r.connected_at ? new Date(r.connected_at).toLocaleString() : "—"} />
                  <Field label="Broker server" value={r.broker_server} mono onCopy={() => copy(r.broker_server, "Server copied")} testid={`broker-server-${i}`} />
                  <Field label="Broker account" value={r.broker_account} mono onCopy={() => copy(r.broker_account, "Account copied")} testid={`broker-account-${i}`} />
                </div>

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
