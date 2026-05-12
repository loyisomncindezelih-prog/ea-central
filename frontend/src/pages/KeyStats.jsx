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
} from "lucide-react";

const TABS = [
  { key: "all",      label: "All" },
  { key: "active",   label: "Activated" },
  { key: "inactive", label: "Not Activated" },
  { key: "expired",  label: "Expired" },
];

export default function KeyStats() {
  const [keys, setKeys] = useState([]);
  const [tab, setTab] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/mentor/keys").then((r) => setKeys(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = keys.filter((k) => {
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
    all: keys.length,
    active: keys.filter((k) => k.status === "active").length,
    inactive: keys.filter((k) => !k.activated).length,
    expired: keys.filter((k) => k.status === "expired").length,
  };

  return (
    <MentorLayout>
      <div data-testid="key-stats-page">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ key stats</div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-2">
              Licence <span className="text-[#1E90FF]">keys</span>.
            </h1>
            <p className="text-white/60 text-sm mt-1">Every key you've generated. Re-activate or delete as needed.</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={load}
              variant="ghost"
              className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-11"
              data-testid="ks-refresh"
            >
              <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
            </Button>
            <Link to="/dashboard/generate-key">
              <Button
                className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5"
                data-testid="ks-generate"
              >
                <Plus className="w-4 h-4 mr-2" /> Generate Key
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-white/10" data-testid="ks-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-xs tracking-[0.22em] uppercase transition border-b-2 -mb-px ${
                tab === t.key
                  ? "text-[#1E90FF] border-[#1E90FF]"
                  : "text-white/55 border-transparent hover:text-white"
              }`}
              data-testid={`ks-tab-${t.key}`}
            >
              {t.label}
              <span className="text-[10px] text-white/40">({counts[t.key]})</span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="ea-glass mt-5">
          <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[10px] tracking-[0.25em] uppercase text-white/40 border-b border-white/10">
            <div className="col-span-4">Key</div>
            <div className="col-span-2">Holder</div>
            <div className="col-span-2">EA</div>
            <div className="col-span-1">Plan</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {loading && (
            <div className="px-5 py-10 text-center text-white/40 text-sm" data-testid="ks-loading">Loading…</div>
          )}
          {!loading && visible.length === 0 && (
            <div className="px-5 py-10 text-center text-white/40 text-sm" data-testid="ks-empty">
              No keys to show in this list.
            </div>
          )}

          {!loading && visible.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-2 px-5 py-4 border-b border-white/5 hover:bg-white/[0.02] transition items-center"
              data-testid={`ks-row-${k.id}`}
            >
              <div className="md:col-span-4 font-mono text-xs sm:text-sm text-white break-all flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-[#1E90FF] shrink-0" />
                <span className="truncate">{k.key}</span>
                <button onClick={() => copy(k.id, k.key)} className="text-white/40 hover:text-[#1E90FF] shrink-0" data-testid={`ks-copy-${k.id}`}>
                  {copiedId === k.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="md:col-span-2 text-sm text-white/85 truncate">{k.holder_username}</div>
              <div className="md:col-span-2 text-sm text-[#1E90FF] truncate">{k.ea_name}</div>
              <div className="md:col-span-1 text-xs text-white/65 font-mono">{k.plan_label}</div>
              <div className="md:col-span-1">
                <StatusBadge k={k} />
              </div>
              <div className="md:col-span-2 flex md:justify-end gap-2 flex-wrap">
                <Button
                  disabled={busyId === k.id}
                  onClick={() => reactivate(k.id)}
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-9 px-3 text-xs tracking-wide disabled:opacity-50"
                  data-testid={`ks-reactivate-${k.id}`}
                >
                  <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                  {k.activated ? "Re-activate" : "Activate"}
                </Button>
                <Button
                  disabled={busyId === k.id}
                  onClick={() => remove(k.id)}
                  variant="ghost"
                  className="border border-white/20 hover:border-white/40 text-white/80 rounded-none h-9 px-3 text-xs tracking-wide disabled:opacity-50"
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
  let cls = "border-white/20 text-white/55 bg-white/[0.02]";
  if (k.status === "active") { label = "Active"; Icon = CheckCircle2; cls = "border-[#1E90FF]/50 text-[#1E90FF] bg-[#1E90FF]/5"; }
  else if (k.status === "expired") { label = "Expired"; Icon = XCircle; cls = "border-white/15 text-white/45 bg-white/[0.02]"; }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 border ${cls} text-[10px] tracking-[0.2em] uppercase`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};
