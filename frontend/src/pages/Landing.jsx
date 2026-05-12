import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Logo, LOGO_URL } from "@/components/Logo";
import {
  Smartphone,
  Server,
  Zap,
  ShieldCheck,
  Activity,
  Wifi,
  ArrowRight,
  CircuitBoard,
} from "lucide-react";

const TICKER = [
  ["EURUSD", "+0.42%"],
  ["XAUUSD", "+1.18%"],
  ["BTCUSD", "+2.06%"],
  ["GBPJPY", "-0.31%"],
  ["USDJPY", "+0.09%"],
  ["NAS100", "+0.74%"],
  ["DJ30",   "+0.21%"],
  ["ETHUSD", "+3.42%"],
];

const FEATURES = [
  {
    icon: Server,
    title: "Host your PC bot",
    body: "Your Expert Advisor stays on the PC you trust. Keep your strategy, your broker, your edge.",
  },
  {
    icon: Smartphone,
    title: "Clients trade from phone",
    body: "Subscribers see and copy every trade from a clean mobile EA — no MT terminal, no VPS, no setup.",
  },
  {
    icon: Wifi,
    title: "No VPS for clients",
    body: "You run the engine. They tap a button. Trades mirror in milliseconds over a secure channel.",
  },
  {
    icon: ShieldCheck,
    title: "Mentor controls",
    body: "Risk caps, lot scaling, pause / resume — your room, your rules. Always.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your terminal",
    body: "Install the ea-central bridge on the PC running your bot. One key pairs it to your mentor account.",
  },
  {
    n: "02",
    title: "Invite your clients",
    body: "Share a link. Clients install the mobile EA, subscribe to your room, and they're live.",
  },
  {
    n: "03",
    title: "Trade. Copy. Scale.",
    body: "Every entry, every exit — mirrored across all phones, instantly, with per-client risk rules.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="landing-page">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 ea-grid opacity-60 pointer-events-none" />
        <div className="absolute -top-32 -right-40 w-[640px] h-[640px] rounded-full bg-[#1E90FF]/20 blur-[140px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-[#1E90FF]/10 blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 md:px-10 pt-20 pb-28 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 ea-fade-up">
            <div className="inline-flex items-center gap-3 px-3 py-1.5 border border-[#1E90FF]/40 bg-[#1E90FF]/5 text-[#1E90FF] text-xs tracking-[0.25em] uppercase">
              <span className="w-2 h-2 bg-[#1E90FF] rounded-full ea-pulse-dot" />
              live · copy trading made mobile
            </div>

            <h1 className="font-display mt-7 text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter leading-[0.95]">
              Host your <span className="text-[#1E90FF] ea-glow">PC bot</span>
              <br />
              as a <span className="underline decoration-[#1E90FF] underline-offset-[10px]">Mobile EA</span>.
            </h1>

            <p className="mt-7 text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
              Your bot trades on your PC. Your clients copy from their phones.
              No VPS for clients, no terminal install, no friction — just a clean mobile
              EA powered by your strategy.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/signup">
                <Button
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-8 py-6 text-base tracking-wide shadow-[0_0_30px_rgba(30,144,255,0.45)]"
                  data-testid="hero-be-mentor-btn"
                >
                  Be a Mentor
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#how">
                <Button
                  variant="ghost"
                  className="border border-white/20 text-white hover:bg-white/5 hover:border-[#1E90FF] rounded-none px-6 py-6 text-sm tracking-wider"
                  data-testid="hero-how-btn"
                >
                  How it works
                </Button>
              </a>
            </div>

            <div className="mt-12 grid grid-cols-3 max-w-md gap-6 text-xs text-white/60 uppercase tracking-[0.2em]">
              <div><div className="text-white text-2xl font-display font-bold">∞</div>clients per mentor</div>
              <div><div className="text-white text-2xl font-display font-bold">0</div>VPS for clients</div>
              <div><div className="text-white text-2xl font-display font-bold">~ms</div>mirror latency</div>
            </div>
          </div>

          {/* Hero device mock */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto w-full max-w-md ea-fade-up" style={{ animationDelay: "120ms" }}>
              <div className="absolute -inset-8 bg-[#1E90FF]/15 blur-3xl rounded-full" />
              <div className="relative ea-glass rounded-3xl p-6">
                <div className="flex items-center justify-between text-xs tracking-[0.25em] uppercase text-white/60">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1E90FF] ea-pulse-dot" />
                    bot · live
                  </div>
                  <span>room #042</span>
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <img src={LOGO_URL} alt="" className="w-14 h-14 rounded-xl" />
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/50">Mentor</div>
                    <div className="font-display text-lg">trader.alpha</div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                  <Stat label="PNL today" value="+$842" highlight />
                  <Stat label="Trades" value="34" />
                  <Stat label="Win %" value="68.5" />
                </div>

                <div className="mt-6 space-y-2">
                  {[
                    ["EURUSD", "BUY",  "+24.50"],
                    ["XAUUSD", "SELL", "+71.20"],
                    ["GBPJPY", "BUY",  "-8.30"],
                    ["BTCUSD", "BUY",  "+132.10"],
                  ].map(([p, s, v]) => (
                    <div
                      key={p}
                      className="flex items-center justify-between border border-white/10 px-3 py-2 text-sm hover:border-[#1E90FF]/40 transition"
                    >
                      <span className="font-mono">{p}</span>
                      <span className={s === "BUY" ? "text-[#1E90FF] text-xs tracking-widest" : "text-white/80 text-xs tracking-widest"}>
                        {s}
                      </span>
                      <span className={`font-mono ${v.startsWith("-") ? "text-white/60" : "text-[#1E90FF]"}`}>{v}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/40">
                  <CircuitBoard className="w-3 h-3" />
                  mirroring 12 connected clients
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="relative border-y border-white/10 bg-black/60 overflow-hidden">
          <div className="ea-ticker flex gap-12 py-3 whitespace-nowrap text-xs uppercase tracking-[0.25em]">
            {[...TICKER, ...TICKER, ...TICKER].map(([sym, chg], i) => (
              <span key={i} className="flex items-center gap-3 text-white/70">
                <span className="text-white">{sym}</span>
                <span className={chg.startsWith("-") ? "text-white/50" : "text-[#1E90FF]"}>{chg}</span>
                <span className="text-white/20">·</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative max-w-7xl mx-auto px-6 md:px-10 py-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end mb-14">
          <div className="md:col-span-7">
            <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ what it does</div>
            <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight mt-4">
              Your terminal, your strategy —
              <br /> their phone, your trades.
            </h2>
          </div>
          <p className="md:col-span-5 text-sm text-white/65 leading-relaxed">
            ea-central is the bridge between the trading bot on your desktop and the mobile EA in your
            clients' pockets. Built for serious mentors who want frictionless copy trading.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="ea-glass p-6 group ea-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
              data-testid={`feature-card-${i}`}
            >
              <div className="w-11 h-11 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF] group-hover:bg-[#1E90FF] group-hover:text-black transition">
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-lg font-semibold mt-5">{title}</h3>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative max-w-7xl mx-auto px-6 md:px-10 py-24 border-t border-white/10">
        <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ how it works</div>
        <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight mt-4 max-w-3xl">
          Three steps to a fully mobile copy trading room.
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="ea-glass p-8 relative"
              data-testid={`how-step-${i}`}
            >
              <div className="text-[#1E90FF] font-display text-5xl font-black tracking-tighter">
                {s.n}
              </div>
              <h3 className="font-display text-xl font-semibold mt-4">{s.title}</h3>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">{s.body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#1E90FF]" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-10 py-24">
        <div className="ea-glass p-10 md:p-16 relative overflow-hidden">
          <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-[#1E90FF]/25 blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-8">
              <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ ready to deploy</div>
              <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight mt-4">
                Run your room. <span className="text-[#1E90FF]">Mobile-first.</span>
              </h2>
              <p className="mt-4 text-white/70 max-w-xl">
                Become an ea-central mentor today. Free to start. Your bot, your terms.
              </p>
            </div>
            <div className="md:col-span-4 flex md:justify-end">
              <Link to="/signup">
                <Button
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-8 py-6 text-base tracking-wide shadow-[0_0_30px_rgba(30,144,255,0.5)]"
                  data-testid="cta-be-mentor-btn"
                >
                  Be a Mentor
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

const Stat = ({ label, value, highlight = false }) => (
  <div className={`border ${highlight ? "border-[#1E90FF]/50 bg-[#1E90FF]/5" : "border-white/10"} px-2 py-3`}>
    <div className={`font-display font-bold text-lg ${highlight ? "text-[#1E90FF]" : "text-white"}`}>{value}</div>
    <div className="text-[10px] tracking-[0.2em] uppercase text-white/40 mt-1">{label}</div>
  </div>
);
