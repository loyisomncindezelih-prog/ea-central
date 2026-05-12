import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Logo, LOGO_URL } from "@/components/Logo";
import { Signal, Wifi, BatteryFull, Lock, ArrowDownRight, ArrowUpRight } from "lucide-react";

const MOCK_TRADES = [
  { pair: "EURUSD", side: "BUY",  entry: 1.0842, lots: 0.10, pnl: 24.5 },
  { pair: "XAUUSD", side: "SELL", entry: 2381.4, lots: 0.05, pnl: 71.2 },
  { pair: "BTCUSD", side: "BUY",  entry: 69240,  lots: 0.01, pnl: 132.1 },
  { pair: "GBPJPY", side: "BUY",  entry: 191.42, lots: 0.20, pnl: -8.3 },
  { pair: "USDJPY", side: "SELL", entry: 153.18, lots: 0.15, pnl: 12.8 },
];

export default function MobilePreview() {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="mobile-preview-page">
      <Header />

      <section className="relative max-w-7xl mx-auto px-6 md:px-10 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ client experience</div>
            <h1 className="font-display text-4xl md:text-6xl font-black tracking-tighter mt-4 leading-[0.95]">
              The mobile EA your <br />
              <span className="text-[#1E90FF]">clients</span> actually use.
            </h1>
            <p className="mt-6 text-white/65 text-base max-w-lg leading-relaxed">
              Clean, fast, on-brand. No MetaTrader, no VPS. Just one screen showing the trades
              you're running on your PC — copied in real time.
            </p>

            <div className="mt-10 space-y-4">
              {[
                ["One-tap subscribe", "Clients join your room with a single link."],
                ["Real-time mirror", "Every entry and exit, same second."],
                ["Per-client risk", "Lot scaling, max drawdown, kill switch."],
                ["Zero install", "Web-based mobile EA. Works on any phone."],
              ].map(([t, b]) => (
                <div key={t} className="flex gap-4 items-start" data-testid={`mp-feature-${t}`}>
                  <div className="w-2 h-2 mt-2 bg-[#1E90FF] rounded-full" />
                  <div>
                    <div className="font-display font-semibold">{t}</div>
                    <div className="text-sm text-white/55">{b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mock */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-10 bg-[#1E90FF]/20 blur-3xl rounded-full" />
              <div
                className="relative w-[320px] h-[640px] rounded-[44px] border border-white/15 bg-[#050505] p-3 shadow-[0_0_60px_rgba(30,144,255,0.25)]"
                data-testid="phone-mock"
              >
                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10" />
                <div className="w-full h-full rounded-[36px] bg-black overflow-hidden flex flex-col">
                  {/* Status bar */}
                  <div className="px-6 pt-3 flex items-center justify-between text-[10px] text-white/70 font-mono">
                    <span>09:41</span>
                    <div className="flex items-center gap-1.5">
                      <Signal className="w-3 h-3" />
                      <Wifi className="w-3 h-3" />
                      <BatteryFull className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* App header */}
                  <div className="px-5 pt-6 flex items-center gap-3">
                    <img src={LOGO_URL} className="w-9 h-9 rounded-lg" alt="" />
                    <div className="flex-1">
                      <div className="text-[9px] uppercase tracking-[0.25em] text-white/40">Connected to</div>
                      <div className="font-display font-bold text-sm">trader.alpha · room #042</div>
                    </div>
                    <Lock className="w-3.5 h-3.5 text-[#1E90FF]" />
                  </div>

                  {/* Live pill */}
                  <div className="px-5 mt-4">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[10px] tracking-[0.25em] uppercase text-[#1E90FF]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1E90FF] ea-pulse-dot" />
                      live mirror
                    </div>
                  </div>

                  {/* Big PNL */}
                  <div className="px-5 mt-5">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">today's pnl</div>
                    <div className="font-display text-4xl font-black text-[#1E90FF] tracking-tight ea-glow">
                      +$842.30
                    </div>
                    <div className="text-[11px] text-white/50 font-mono mt-1">34 trades · 68.5% win</div>
                  </div>

                  {/* Trade list */}
                  <div className="px-3 mt-5 flex-1 overflow-hidden">
                    <div className="text-[9px] tracking-[0.25em] uppercase text-white/40 px-2 mb-2">
                      mirrored trades
                    </div>
                    <div className="space-y-1.5">
                      {MOCK_TRADES.map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-white/[0.03] border border-white/5 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            {t.side === "BUY" ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-[#1E90FF]" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5 text-white/60" />
                            )}
                            <div>
                              <div className="font-mono text-xs">{t.pair}</div>
                              <div className="text-[9px] text-white/40 tracking-[0.2em] uppercase">
                                {t.side} · {t.lots} lots
                              </div>
                            </div>
                          </div>
                          <div className={`font-mono text-xs ${t.pnl < 0 ? "text-white/55" : "text-[#1E90FF]"}`}>
                            {t.pnl > 0 ? "+" : ""}
                            {t.pnl.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom action */}
                  <div className="p-4 border-t border-white/10">
                    <div className="bg-[#1E90FF] text-black text-center py-2.5 font-bold tracking-wide text-sm">
                      AUTO-COPY ON
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
