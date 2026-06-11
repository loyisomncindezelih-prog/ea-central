import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  KeyRound,
  RefreshCcw,
  Trash2,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  Sparkles,
} from "lucide-react";

const CACHE_KEY = "ea_mentor_keys_cache";

const TABS = [
  { key: "all",      label: "All" },
  { key: "active",   label: "Activated" },
  { key: "inactive", label: "Not Activated" },
  { key: "expired",  label: "Expired" },
];

export default function KeyStats() {
  // Hydrate from sessionStorage for instant first paint — stale-while-revalidate.
  const [keys, setKeys] = useState(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [tab, setTab] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(!keys);

  const load = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true);
    api.get("/mentor/keys")
      .then((r) => {
        setKeys(r.data);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(r.data)); } catch { /* ignore */ }
      })
      .catch(() => { /* keep cached keys */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const list = keys || [];
  const visible = list.filter((k) => {
    if (tab === "all") return true;
    if (tab === "inactive") return !k.activated;
    return k.status === tab;
  });

  const reactivate = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/mentor/keys/${id}/reactivate`);
      toast.success("Key re-activated");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this licence key? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await api.delete(`/mentor/keys/${id}`);
      toast.success("Key deleted");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (id, value) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    toast.success("Copied");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const counts = {
    all: list.length,
    active: list.filter((k) => k.status === "active").length,
    inactive: list.filter((k) => !k.activated).length,
    expired: list.filter((k) => k.status === "expired").length,
  };

  return (
    <MentorLayout>
      <div data-testid="key-stats-page" className="ea-mobile">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 ea-card-enter">
          <div>
            <div className="text-[10px] sm:text-xs tracking-[0.32em] uppercase text-[#1E90FF] flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> / key stats
            </div>
            <h1 className="ea-mobile-display text-3xl sm:text-4xl md:text-5xl text-white leading-[1.05] mt-3">
              Licence <span className="text-[#1E90FF]">keys</span>.
            </h1>
            <p className="text-white/55 text-sm mt-2.5 leading-relaxed">
              Every key you've generated. Re-activate or delete as needed.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => load(true)}
              className="bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-11 px-4 text-xs font-semibold tracking-[0.18em] uppercase ea-tap"
              data-testid="ks-refresh"
            >
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Link to="/dashboard/generate-key">
              <Button
                className="text-black font-bold rounded-xl h-11 px-5 tracking-wide ea-tap"
                style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 18px rgba(30,144,255,0.55)" }}
                data-testid="ks-generate"
              >
                <Plus className="w-4 h-4 mr-2" /> Generate Key
              </Button>
            </Link>
          </div>
        </div>

        {/* Count chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-7">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`ea-card rounded-xl px-4 py-3.5 text-left transition ea-tap-soft ea-card-enter ${
                tab === t.key ? "" : "hover:bg-white/[0.03]"
              }`}
              style={{
                animationDelay: `${0.05 + i * 0.04}s`,
                ...(tab === t.key
                  ? { border: "1px solid rgba(30,144,255,0.45)", backgroundColor: "rgba(30,144,255,0.06)" }
                  : {}),
              }}
              data-testid={`ks-tab-${t.key}`}
            >
              <div className={`text-[10px] tracking-[0.25em] uppercase font-semibold ${tab === t.key ? "text-[#1E90FF]" : "text-white/40"}`}>
                {t.label}
              </div>
              <div className="ea-mobile-display text-2xl text-white mt-1.5">
                {loading && !keys ? <span className="inline-block h-7 w-10 ea-shimmer rounded-md" /> : counts[t.key]}
              </div>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="ea-card-elevated rounded-2xl mt-5 overflow-hidden ea-card-enter" style={{ animationDelay: "0.22s" }} data-testid="ks-tabs">
          <div className="hidden md:grid grid-cols-12 px-5 py-3.5 text-[10px] tracking-[0.25em] uppercase text-white/40 border-b border-white/10">
            <div className="col-span-4">Key</div>
            <div className="col-span-2">Holder</div>
            <div className="col-span-2">EA</div>
            <div className="col-span-1">Plan</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loading && !keys && (
            <div className="px-5 py-5 space-y-3" data-testid="ks-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 ea-shimmer rounded-xl" />
              ))}
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="px-5 py-12 text-center ea-card-enter" data-testid="ks-empty">
              <KeyRound className="w-8 h-8 text-white/15 mx-auto" />
              <div className="text-white/40 text-sm mt-3">No keys to show in this list.</div>
            </div>
          )}

          {visible.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-2 px-5 py-4 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition items-center"
              data-testid={`ks-row-${k.id}`}
            >
              <div className="md:col-span-4 ea-mono text-xs sm:text-sm text-white break-all flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#1E90FF1A", color: "#1E90FF" }}>
                  <KeyRound className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">{k.key}</span>
                <button
                  onClick={() => copy(k.id, k.key)}
                  className="text-white/40 hover:text-[#1E90FF] shrink-0 ea-tap"
                  data-testid={`ks-copy-${k.id}`}
                >
                  {copiedId === k.id ? <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="md:col-span-2 text-sm text-white/85 truncate">{k.holder_username}</div>
              <div className="md:col-span-2 text-sm text-[#1E90FF] truncate">{k.ea_name}</div>
              <div className="md:col-span-1 text-xs text-white/65 ea-mono">{k.plan_label}</div>
              <div className="md:col-span-1">
                <StatusBadge k={k} />
              </div>
              <div className="md:col-span-2 flex md:justify-end gap-2 flex-wrap">
                <Button
                  disabled={busyId === k.id}
                  onClick={() => reactivate(k.id)}
                  className="text-black font-bold rounded-xl h-9 px-3.5 text-xs tracking-wide disabled:opacity-50 ea-tap"
                  style={{ backgroundColor: "#1E90FF" }}
                  data-testid={`ks-reactivate-${k.id}`}
                >
                  <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                  {k.activated ? "Re-activate" : "Activate"}
                </Button>
                <Button
                  disabled={busyId === k.id}
                  onClick={() => remove(k.id)}
                  className="bg-transparent ea-card hover:bg-white/[0.04] text-white/80 rounded-xl h-9 px-3.5 text-xs tracking-wide disabled:opacity-50 ea-tap"
                  data-testid={`ks-delete-${k.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Delete
                </Button>
              </div>
              {k.expires_at && (
                <div className="md:col-span-12 text-[10px] tracking-[0.2em] uppercase text-white/35 md:text-right md:-mt-1">
                  expires {new Date(k.expires_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </MentorLayout>
  );
}

const StatusBadge = ({ k }) => {
  let label = "Inactive";
  let Icon = Clock;
  let style = { border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.02)" };
  if (k.status === "active") {
    label = "Active"; Icon = CheckCircle2;
    style = { border: "1px solid rgba(16,185,129,0.45)", color: "#10B981", backgroundColor: "rgba(16,185,129,0.06)" };
  } else if (k.status === "expired") {
    label = "Expired"; Icon = XCircle;
    style = { border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.02)" };
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] tracking-[0.2em] uppercase font-semibold" style={style}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};
