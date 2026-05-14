import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  KeyRound,
  RefreshCcw,
  Unlock,
  ShieldCheck,
  ArrowLeft,
  Copy,
  CheckCircle2,
} from "lucide-react";

export default function AdminLicenses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("bound"); // bound | unbound | all
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/licenses")
      .then((r) => setLicenses(r.data))
      .catch((err) => toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const release = async (id) => {
    if (!window.confirm("Release this licence? It can then be bound to a different email on the mobile app.")) return;
    setBusyId(id);
    try {
      await api.post(`/admin/licenses/${id}/release`);
      toast.success("Licence released");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (id, val) => {
    await navigator.clipboard.writeText(val);
    setCopiedId(id);
    toast.success("Copied");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const visible = licenses.filter((l) => {
    if (filter === "bound") return !!l.bound_to_email;
    if (filter === "unbound") return !l.bound_to_email;
    return true;
  });

  return (
    <div className="min-h-screen bg-black text-white" data-testid="admin-licenses-page">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12">
        <button onClick={() => navigate("/admin/dashboard")} className="text-xs tracking-[0.22em] uppercase text-white/55 hover:text-[#1E90FF] flex items-center gap-2 mb-4" data-testid="back-admin">
          <ArrowLeft className="w-4 h-4" /> back to users
        </button>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">
              <ShieldCheck className="w-3.5 h-3.5" />
              / admin · licences
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight mt-3">
              Mobile <span className="text-[#1E90FF]">licences</span>.
            </h1>
            <p className="text-white/60 text-sm mt-2">
              Release a licence to unbind it from an email, so the user can re-activate on the Mobile EA.
            </p>
            <p className="text-white/45 text-xs mt-1">Signed in as <span className="font-mono">{user?.email}</span></p>
          </div>
          <Button onClick={load} variant="ghost" className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-11" data-testid="lic-refresh">
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-white/10 mt-8" data-testid="lic-tabs">
          {[
            { k: "bound",  label: "In use" },
            { k: "unbound", label: "Available" },
            { k: "all",    label: "All" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={`px-4 sm:px-5 py-3 text-xs tracking-[0.22em] uppercase border-b-2 -mb-px ${
                filter === t.k ? "text-[#1E90FF] border-[#1E90FF]" : "text-white/55 border-transparent hover:text-white"
              }`}
              data-testid={`lic-tab-${t.k}`}
            >
              {t.label}
              <span className="ml-1 text-[10px] text-white/40">
                ({t.k === "all"
                  ? licenses.length
                  : t.k === "bound"
                    ? licenses.filter((l) => l.bound_to_email).length
                    : licenses.filter((l) => !l.bound_to_email).length})
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 ea-glass">
          <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[10px] tracking-[0.25em] uppercase text-white/40 border-b border-white/10">
            <div className="col-span-3">Licence</div>
            <div className="col-span-2">Mentor</div>
            <div className="col-span-3">Bound to email</div>
            <div className="col-span-2">EA</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {loading && <div className="px-5 py-10 text-center text-white/40 text-sm" data-testid="lic-loading">Loading…</div>}
          {!loading && visible.length === 0 && (
            <div className="px-5 py-10 text-center text-white/40 text-sm" data-testid="lic-empty">No licences in this view.</div>
          )}

          {!loading && visible.map((l) => (
            <div key={l.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-2 px-5 py-4 border-b border-white/5 hover:bg-white/[0.02] items-center" data-testid={`lic-row-${l.id}`}>
              <div className="md:col-span-3 font-mono text-xs sm:text-sm flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-[#1E90FF] shrink-0" />
                <span className="truncate">{l.key}</span>
                <button onClick={() => copy(l.id, l.key)} className="text-white/40 hover:text-[#1E90FF] shrink-0" data-testid={`lic-copy-${l.id}`}>
                  {copiedId === l.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="md:col-span-2 text-sm">
                <div className="text-white truncate">{l.mentor_username}</div>
                <div className="text-[10px] text-white/40 truncate">{l.mentor_email}</div>
              </div>
              <div className="md:col-span-3 text-sm font-mono">
                {l.bound_to_email ? (
                  <span className="text-[#1E90FF] break-all">{l.bound_to_email}</span>
                ) : (
                  <span className="text-white/40">— not in use —</span>
                )}
              </div>
              <div className="md:col-span-2 text-[#1E90FF] text-sm truncate">{l.ea_name}</div>
              <div className="md:col-span-2 md:text-right">
                <Button
                  disabled={!l.bound_to_email || busyId === l.id}
                  onClick={() => release(l.id)}
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-9 px-4 text-xs tracking-wide disabled:opacity-40"
                  data-testid={`lic-release-${l.id}`}
                >
                  <Unlock className="w-4 h-4 mr-1.5" />
                  Release
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
