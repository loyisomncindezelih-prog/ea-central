import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Cpu,
  Copy,
  CheckCircle2,
  Lock,
  Trash2,
  Plus,
  X,
  ArrowLeft,
} from "lucide-react";

const QUICK = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "XAUUSD", "BTCUSD", "ETHUSD", "GBPJPY"];

export default function EADetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ea, setEa] = useState(null);
  const [sym, setSym] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.get(`/mentor/eas/${id}`).then((r) => setEa(r.data)).catch(() => {});
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const copyCode = async () => {
    if (!ea) return;
    await navigator.clipboard.writeText(ea.private_code);
    setCopied(true);
    toast.success("Private code copied");
    setTimeout(() => setCopied(false), 1800);
  };

  const addSymbol = async (s) => {
    if (!s) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/mentor/eas/${id}/symbols`, { symbol: s });
      setEa(data);
      setSym("");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeSymbol = async (s) => {
    setBusy(true);
    try {
      const { data } = await api.delete(`/mentor/eas/${id}/symbols/${encodeURIComponent(s)}`);
      setEa(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteEA = async () => {
    if (!window.confirm(`Delete "${ea?.name}"? This will also remove all licence keys issued for it. This cannot be undone.`)) return;
    try {
      await api.delete(`/mentor/eas/${id}`);
      toast.success("EA deleted");
      navigate("/dashboard/manage-eas");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  if (!ea) {
    return (
      <MentorLayout>
        <div className="text-white/50 text-sm" data-testid="ea-detail-loading">Loading…</div>
      </MentorLayout>
    );
  }

  return (
    <MentorLayout>
      <div data-testid="ea-detail-page">
        <button
          onClick={() => navigate("/dashboard/manage-eas")}
          className="text-xs tracking-[0.22em] uppercase text-white/55 hover:text-[#1E90FF] flex items-center gap-2 mb-4"
          data-testid="ea-back"
        >
          <ArrowLeft className="w-4 h-4" /> back to EAs
        </button>

        {/* Banner */}
        <div className="ea-glass p-7 sm:p-9 border-l-4 border-[#1E90FF] relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[#1E90FF]/30 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#1E90FF]">
                <Cpu className="w-3.5 h-3.5" /> Expert Advisor
              </div>
              <span className="inline-flex items-center gap-2 px-3 py-1 text-[10px] tracking-[0.25em] uppercase border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
                <Lock className="w-3 h-3" /> keep code private
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight mt-3 break-words">
              {ea.name}
            </h1>

            <div className="mt-6 border border-[#1E90FF]/40 bg-[#1E90FF]/5 p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 font-mono text-sm sm:text-base text-white break-all" data-testid="ea-private-code">
                {ea.private_code}
              </div>
              <Button
                onClick={copyCode}
                className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5"
                data-testid="ea-copy-code"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-4 text-xs text-white/55 leading-relaxed max-w-2xl">
              Embed this private code inside your Expert Advisor source. It authenticates the EA with the licensing server.
              Do not share it.
            </p>
          </div>
        </div>

        {/* Delete + symbol counter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          <div className="ea-glass p-5">
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/45 mb-1">/ symbols</div>
            <div className="font-display text-2xl font-bold">
              {ea.symbols.length}
              <span className="text-white/40 text-sm font-mono"> active</span>
            </div>
            <p className="text-xs text-white/55 mt-1">Pairs/quotes this EA is allowed to trade.</p>
          </div>
          <div className="ea-glass p-5 border border-white/15 flex items-center justify-between" data-testid="ea-delete-card">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/45 mb-1">/ danger zone</div>
              <div className="font-display text-sm sm:text-base font-semibold">Delete this EA</div>
              <div className="text-xs text-white/55 mt-1">This action cannot be undone.</div>
            </div>
            <Button
              onClick={deleteEA}
              className="bg-transparent border border-white/30 text-white hover:bg-white/5 hover:border-white rounded-none h-10 px-4 text-xs tracking-[0.18em] uppercase"
              data-testid="ea-delete-btn"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        {/* Symbols manager */}
        <div className="ea-glass p-6 mt-6" data-testid="ea-symbols">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-xl font-semibold">Symbols</h2>
            <span className="text-[10px] tracking-[0.22em] uppercase text-[#1E90FF]">
              {ea.symbols.length} active
            </span>
          </div>
          <p className="text-xs text-white/55">Add the pairs/quotes you want this EA to operate on.</p>

          {/* Quick add chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK.filter((q) => !ea.symbols.includes(q)).map((q) => (
              <button
                key={q}
                onClick={() => addSymbol(q)}
                disabled={busy}
                className="text-xs tracking-wider font-mono border border-white/15 px-3 py-1.5 hover:border-[#1E90FF] hover:text-[#1E90FF] disabled:opacity-50"
                data-testid={`ea-quick-${q}`}
              >
                + {q}
              </button>
            ))}
          </div>

          {/* Custom add */}
          <form
            onSubmit={(e) => { e.preventDefault(); addSymbol(sym.trim().toUpperCase()); }}
            className="mt-5 flex gap-3"
            data-testid="ea-add-symbol-form"
          >
            <Input
              value={sym}
              onChange={(e) => setSym(e.target.value)}
              placeholder="e.g. USDMXN"
              className="flex-1 bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-11 font-mono uppercase"
              data-testid="ea-symbol-input"
            />
            <Button
              type="submit"
              disabled={busy || !sym.trim()}
              className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5 disabled:opacity-50"
              data-testid="ea-symbol-add"
            >
              <Plus className="w-4 h-4 mr-2" /> Add
            </Button>
          </form>

          {/* Active list */}
          <div className="mt-6">
            <div className="text-[10px] tracking-[0.22em] uppercase text-white/45 mb-2">active symbols</div>
            {ea.symbols.length === 0 && (
              <div className="text-sm text-white/45 py-6 text-center border border-dashed border-white/10" data-testid="ea-symbols-empty">
                No symbols yet — add at least one above.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ea.symbols.map((s) => (
                <div
                  key={s}
                  className="flex items-center justify-between border border-white/10 px-3 py-2 hover:border-[#1E90FF]/40 transition"
                  data-testid={`ea-symbol-${s}`}
                >
                  <span className="flex items-center gap-2 font-mono text-sm">
                    <span className="w-1.5 h-1.5 bg-[#1E90FF]" />
                    {s}
                  </span>
                  <button
                    onClick={() => removeSymbol(s)}
                    disabled={busy}
                    className="text-white/40 hover:text-white"
                    data-testid={`ea-symbol-remove-${s}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MentorLayout>
  );
}
