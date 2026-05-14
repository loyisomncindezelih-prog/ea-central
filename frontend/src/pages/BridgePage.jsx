import { useEffect, useState } from "react";
import MentorLayout from "@/components/MentorLayout";
import { api, formatApiErrorDetail, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Cpu, Copy, RefreshCcw, Download, Terminal, Activity, Wifi, WifiOff } from "lucide-react";

const copy = (text, label = "Copied") => {
  navigator.clipboard.writeText(text);
  toast.success(label);
};

export default function BridgePage() {
  const [apiKey, setApiKey] = useState(null);
  const [activity, setActivity] = useState({ bridges: [], recent_signals: [] });
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [k, a] = await Promise.all([
        api.get("/mentor/api-key"),
        api.get("/mentor/bridge/activity"),
      ]);
      setApiKey(k.data.api_key);
      setActivity(a.data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 8000);
    return () => clearInterval(iv);
  }, []);

  const rotate = async () => {
    if (apiKey && !window.confirm("Rotate API key? Your existing PC bot will stop pushing until you update it with the new key.")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/mentor/api-key/rotate");
      setApiKey(data.api_key);
      toast.success("New API key generated");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  const apiBase = API; // e.g. https://api.ea-central.co/api
  const curlSample = apiKey
    ? `curl -X POST ${apiBase}/bridge/mentor-push \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"ea_id":"<your-ea-id>","symbol":"EURUSD","action":"BUY","lot":0.10}'`
    : "Generate your API key first.";

  return (
    <MentorLayout>
      <div data-testid="bridge-page">
        <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ mentor bridge</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-2">
          MetaTrader <span className="text-[#1E90FF]">bridge</span>.
        </h1>
        <p className="text-white/65 text-sm mt-2 max-w-2xl">
          Connect your PC bot to ea-central. Your bot pushes signals via API — clients running
          the desktop helper execute the trades automatically on their MT4 / MT5 terminals.
        </p>

        {/* API key card */}
        <section className="ea-glass mt-8 p-6" data-testid="bridge-apikey-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Mentor API key</div>
              <p className="text-white/65 text-xs mt-1">Use this in your PC bot's Authorization header.</p>
            </div>
            <Cpu className="w-5 h-5 text-[#1E90FF]" />
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch">
            <code className="flex-1 bg-black/50 border border-white/15 px-4 py-3 font-mono text-xs sm:text-sm text-white/90 truncate" data-testid="bridge-apikey">
              {apiKey || "— not generated yet —"}
            </code>
            <div className="flex gap-2">
              {apiKey && (
                <Button onClick={() => copy(apiKey, "API key copied")} className="bg-transparent border border-white/15 hover:border-[#1E90FF] text-white rounded-none h-12 px-4" data-testid="bridge-apikey-copy">
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              <Button onClick={rotate} disabled={busy} className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 px-4 tracking-wide" data-testid="bridge-apikey-rotate">
                <RefreshCcw className="w-4 h-4 mr-2" />
                {apiKey ? "Rotate" : "Generate"}
              </Button>
            </div>
          </div>
        </section>

        {/* Push signal example */}
        <section className="ea-glass mt-6 p-6" data-testid="bridge-curl-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Push signal · sample</div>
              <p className="text-white/65 text-xs mt-1">Have your PC bot call this whenever it opens a trade.</p>
            </div>
            <Terminal className="w-5 h-5 text-[#1E90FF]" />
          </div>
          <pre className="mt-4 bg-black/60 border border-white/15 px-4 py-3 font-mono text-[11px] sm:text-xs text-white/85 overflow-x-auto whitespace-pre" data-testid="bridge-curl">{curlSample}</pre>
          {apiKey && (
            <Button onClick={() => copy(curlSample, "curl copied")} className="mt-3 bg-transparent border border-white/15 hover:border-[#1E90FF] text-white rounded-none h-10 px-4 text-xs" data-testid="bridge-curl-copy">
              <Copy className="w-3.5 h-3.5 mr-2" /> Copy
            </Button>
          )}
        </section>

        {/* Download helper */}
        <section className="ea-glass mt-6 p-6" data-testid="bridge-download-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Client desktop helper</div>
              <p className="text-white/65 text-xs mt-1">
                Clients download this script onto their Windows PC, then run <code className="text-[#1E90FF]">python ea_central_bridge.py</code>.
                MT5 supported natively, MT4 in a follow-up release.
              </p>
            </div>
            <Download className="w-5 h-5 text-[#1E90FF]" />
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <a href={`${apiBase}/bridge/download`} target="_blank" rel="noopener noreferrer" className="inline-block">
              <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5 tracking-wide" data-testid="bridge-download-btn">
                <Download className="w-4 h-4 mr-2" />
                Download ea_central_bridge.py
              </Button>
            </a>
            <code className="text-[11px] text-white/55 px-2 py-2 self-center">requires: <span className="text-white/80">pip install MetaTrader5 requests</span></code>
          </div>
        </section>

        {/* Live activity */}
        <section className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-5" data-testid="bridge-activity-section">
          <div className="ea-glass p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Paired client bridges</div>
              <Activity className="w-4 h-4 text-[#1E90FF]" />
            </div>
            <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {activity.bridges.length === 0 && (
                <div className="text-xs text-white/45 border border-white/10 p-3 text-center">No clients paired yet.</div>
              )}
              {activity.bridges.map((b) => (
                <BridgeRow key={b.license_key} b={b} />
              ))}
            </div>
          </div>

          <div className="ea-glass p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Recent signals</div>
              <span className="text-[10px] tracking-[0.22em] uppercase text-white/45">{activity.recent_signals.length}</span>
            </div>
            <div className="mt-4 space-y-1 max-h-[420px] overflow-y-auto pr-1">
              {activity.recent_signals.length === 0 && (
                <div className="text-xs text-white/45 border border-white/10 p-3 text-center">No signals yet — push your first trade from the PC bot.</div>
              )}
              {activity.recent_signals.map((s) => (
                <SignalRow key={s.id} s={s} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </MentorLayout>
  );
}

const BridgeRow = ({ b }) => {
  const online = b.last_seen_at && (Date.now() - new Date(b.last_seen_at).getTime()) < 20_000;
  return (
    <div className="border border-white/10 px-3 py-2 flex items-center gap-3" data-testid={`bridge-row-${b.license_key}`}>
      {online ? <Wifi className="w-4 h-4 text-[#1E90FF]" /> : <WifiOff className="w-4 h-4 text-white/30" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white truncate">{b.email}</div>
        <div className="text-[10px] text-white/45 font-mono truncate">{b.license_key} · {b.platform?.toUpperCase()}</div>
      </div>
      <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: online ? "#1E90FF" : "rgba(255,255,255,0.4)" }}>
        {online ? "live" : (b.last_seen_at ? "idle" : "never")}
      </div>
    </div>
  );
};

const SignalRow = ({ s }) => {
  const color = s.status === "executed" ? "#1E90FF" : s.status === "failed" ? "#FF3B3B" : "rgba(255,255,255,0.45)";
  return (
    <div className="border border-white/10 px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs" data-testid={`signal-row-${s.id}`}>
      <div className="col-span-3 font-mono text-white/65 truncate">{new Date(s.created_at).toLocaleTimeString()}</div>
      <div className="col-span-2 font-bold" style={{ color: s.action === "BUY" ? "#1E90FF" : s.action === "SELL" ? "#FF3B3B" : "#fff" }}>{s.action}</div>
      <div className="col-span-3 font-mono text-white truncate">{s.symbol}</div>
      <div className="col-span-2 text-white/65 font-mono">{s.lot}</div>
      <div className="col-span-2 text-[10px] tracking-[0.18em] uppercase text-right" style={{ color }}>{s.status}</div>
    </div>
  );
};
