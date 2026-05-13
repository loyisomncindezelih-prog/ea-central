import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LOGO_URL } from "@/components/Logo";
import {
  Smartphone,
  Server,
  Wifi,
  ShieldCheck,
  ArrowRight,
  Download,
  Apple,
  MonitorDown,
  CircuitBoard,
} from "lucide-react";

const MOBILE_EA_IMG =
  "https://customer-assets.emergentagent.com/job_copy-trading-hub-2/artifacts/ukmwnbqz_ChatGPT%20Image%20May%2013%2C%202026%2C%2009_34_45%20PM.png";

const TICKER = [
  ["EURUSD", "+0.42%"], ["XAUUSD", "+1.18%"], ["BTCUSD", "+2.06%"],
  ["GBPJPY", "-0.31%"], ["USDJPY", "+0.09%"], ["NAS100", "+0.74%"],
  ["DJ30", "+0.21%"],   ["ETHUSD", "+3.42%"],
];

const FEATURES = [
  { icon: Server,       title: "Host your PC bot",       body: "Your Expert Advisor stays on the PC you trust. Keep your strategy, your broker, your edge." },
  { icon: Smartphone,   title: "Clients download the EA", body: "Subscribers install a clean Mobile EA app — no MT terminal, no VPS, no setup." },
  { icon: Wifi,         title: "No VPS for clients",     body: "You run the engine. They tap a button. Trades mirror in milliseconds over a secure channel." },
  { icon: ShieldCheck,  title: "Mentor controls",        body: "Risk caps, lot scaling, pause / resume — your room, your rules. Always." },
];

const STEPS = [
  { n: "01", title: "Download the bot bridge", body: "Install the ea-central bridge on the PC running your bot. One key pairs it to your mentor account." },
  { n: "02", title: "Invite your clients",     body: "Share a link. Clients download the Mobile EA, subscribe to your room, and they're live." },
  { n: "03", title: "Trade. Copy. Scale.",     body: "Every entry, every exit — mirrored across all phones, instantly, with per-client risk rules." },
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

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pt-14 sm:pt-20 pb-20 sm:pb-28 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7 ea-fade-up">
            <div className="inline-flex items-center gap-2 sm:gap-3 px-3 py-1.5 border border-[#1E90FF]/40 bg-[#1E90FF]/5 text-[#1E90FF] text-[10px] sm:text-xs tracking-[0.22em] sm:tracking-[0.25em] uppercase">
              <span className="w-2 h-2 bg-[#1E90FF] rounded-full ea-pulse-dot" />
              live · download · copy
            </div>

            <h1 className="font-display mt-6 text-[2.4rem] sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[0.95]">
              Host your <span className="text-[#1E90FF] ea-glow">PC bot</span>.
              <br />
              Clients <span className="underline decoration-[#1E90FF] underline-offset-[8px] sm:underline-offset-[10px]">download</span> the EA.
            </h1>

            <p className="mt-6 sm:mt-7 text-sm sm:text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
              Your bot trades on your PC. Your clients install the ea-central Mobile EA
              on their phone and copy every trade. No VPS for clients, no terminal install,
              no friction.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
              <Link to="/signup">
                <Button
                  className="w-full sm:w-auto bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-6 sm:px-8 py-5 sm:py-6 text-sm sm:text-base tracking-wide shadow-[0_0_30px_rgba(30,144,255,0.45)]"
                  data-testid="hero-be-mentor-btn"
                >
                  Be a Mentor
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <a href="#download" className="w-full sm:w-auto">
                <Button
                  variant="ghost"
                  className="w-full sm:w-auto border border-white/20 text-white hover:bg-white/5 hover:border-[#1E90FF] rounded-none px-6 py-5 sm:py-6 text-xs sm:text-sm tracking-wider"
                  data-testid="hero-download-btn"
                >
                  <Download className="mr-2 w-4 h-4" />
                  Download Mobile EA
                </Button>
              </a>
            </div>

            <div className="mt-10 sm:mt-12 grid grid-cols-3 max-w-md gap-4 sm:gap-6 text-[10px] sm:text-xs text-white/60 uppercase tracking-[0.18em] sm:tracking-[0.2em]">
              <div><div className="text-white text-xl sm:text-2xl font-display font-bold">∞</div>clients per mentor</div>
              <div><div className="text-white text-xl sm:text-2xl font-display font-bold">0</div>vps for clients</div>
              <div><div className="text-white text-xl sm:text-2xl font-display font-bold">~ms</div>mirror latency</div>
            </div>
          </div>

          {/* Phone with real Mobile EA screenshot */}
          <div className="lg:col-span-5 relative flex justify-center">
            <div className="relative w-full max-w-[280px] sm:max-w-[320px] ea-fade-up" style={{ animationDelay: "120ms" }}>
              <div className="absolute -inset-8 bg-[#1E90FF]/20 blur-3xl rounded-full" />
              <div className="relative rounded-[40px] border border-white/15 bg-[#050505] p-2 sm:p-3 shadow-[0_0_50px_rgba(30,144,255,0.3)]">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 sm:w-28 h-5 sm:h-6 bg-black rounded-b-2xl z-10" />
                <div className="aspect-[9/19] rounded-[32px] overflow-hidden bg-black">
                  <img
                    src={MOBILE_EA_IMG}
                    alt="ea-central Mobile EA"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/45">
                <CircuitBoard className="w-3 h-3 text-[#1E90FF]" />
                ea-central mobile EA
              </div>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="relative border-y border-white/10 bg-black/60 overflow-hidden">
          <div className="ea-ticker flex gap-8 sm:gap-12 py-3 whitespace-nowrap text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.25em]">
            {[...TICKER, ...TICKER, ...TICKER].map(([sym, chg], i) => (
              <span key={i} className="flex items-center gap-2 sm:gap-3 text-white/70">
                <span className="text-white">{sym}</span>
                <span className={chg.startsWith("-") ? "text-white/50" : "text-[#1E90FF]"}>{chg}</span>
                <span className="text-white/20">·</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-end mb-10 sm:mb-14">
          <div className="md:col-span-7">
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ what it does</div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mt-3 sm:mt-4">
              Your terminal, your strategy —
              <br className="hidden sm:block" /> their phone, your trades.
            </h2>
          </div>
          <p className="md:col-span-5 text-sm text-white/65 leading-relaxed">
            ea-central is the bridge between the trading bot on your desktop and the Mobile EA in your
            clients' pockets. Built for serious mentors who want frictionless copy trading.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="ea-glass p-5 sm:p-6 group ea-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
              data-testid={`feature-card-${i}`}
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF] group-hover:bg-[#1E90FF] group-hover:text-black transition">
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-base sm:text-lg font-semibold mt-4 sm:mt-5">{title}</h3>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24 border-t border-white/10">
        <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ how it works</div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mt-3 sm:mt-4 max-w-3xl">
          Three steps to a fully mobile copy trading room.
        </h2>

        <div className="mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 relative">
          {STEPS.map((s, i) => (
            <div key={s.n} className="ea-glass p-6 sm:p-8 relative" data-testid={`how-step-${i}`}>
              <div className="text-[#1E90FF] font-display text-4xl sm:text-5xl font-bold tracking-tight">{s.n}</div>
              <h3 className="font-display text-lg sm:text-xl font-semibold mt-3 sm:mt-4">{s.title}</h3>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">{s.body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#1E90FF]" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* DOWNLOAD */}
      <section id="download" className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24 border-t border-white/10">
        <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ download</div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mt-3 sm:mt-4 max-w-3xl">
          One platform. Two downloads.
        </h2>
        <p className="mt-3 sm:mt-4 text-white/65 text-sm sm:text-base max-w-2xl">
          ea-central is installed software — never run in a browser. Mentors download the PC bridge,
          clients download the Mobile EA. That's it.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {/* Mentor bridge */}
          <div className="ea-glass p-6 sm:p-8" data-testid="download-mentor">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
                <MonitorDown className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45">for mentors</div>
                <h3 className="font-display text-lg sm:text-xl font-semibold">PC Bot Bridge</h3>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/65 leading-relaxed">
              The desktop companion that pairs your trading bot to ea-central. Install once,
              pair with your account, your trades start broadcasting to every subscriber's phone.
            </p>
            <ul className="mt-5 space-y-2 text-xs sm:text-sm text-white/70">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full" /> Windows 10/11 · macOS 13+ · Linux</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full" /> Works with MT4 / MT5 / cTrader</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full" /> Secure pairing key, encrypted channel</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#" data-testid="download-bridge-windows">
                <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-5 h-11">
                  <Download className="w-4 h-4 mr-2" />
                  Windows .exe
                </Button>
              </a>
              <a href="#" data-testid="download-bridge-mac">
                <Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-5 h-11">
                  <Apple className="w-4 h-4 mr-2" />
                  macOS .dmg
                </Button>
              </a>
            </div>
          </div>

          {/* Client mobile EA */}
          <div className="ea-glass p-6 sm:p-8" data-testid="download-client">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
                <Smartphone className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45">for clients</div>
                <h3 className="font-display text-lg sm:text-xl font-semibold">Mobile EA app</h3>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/65 leading-relaxed">
              The app your subscribers install. Add their EA license, link their broker, hit
              START TRADES — done. Every move from your bot mirrors here.
            </p>
            <ul className="mt-5 space-y-2 text-xs sm:text-sm text-white/70">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full" /> iOS 15+ · Android 8+</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full" /> Live quotes · trade history · settings</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full" /> No MT terminal required, ever</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#" data-testid="download-mobile-ios">
                <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-5 h-11">
                  <Apple className="w-4 h-4 mr-2" />
                  App Store
                </Button>
              </a>
              <a href="#" data-testid="download-mobile-android">
                <Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-5 h-11">
                  <Download className="w-4 h-4 mr-2" />
                  Android APK
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24">
        <div className="ea-glass p-8 sm:p-12 md:p-16 relative overflow-hidden">
          <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-[#1E90FF]/25 blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-center">
            <div className="md:col-span-8">
              <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ ready to deploy</div>
              <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mt-3 sm:mt-4">
                Run your room. <span className="text-[#1E90FF]">Mobile-first.</span>
              </h2>
              <p className="mt-3 sm:mt-4 text-white/70 max-w-xl text-sm sm:text-base">
                Become an ea-central mentor today. Free to start. Your bot, your terms.
              </p>
            </div>
            <div className="md:col-span-4 flex md:justify-end">
              <Link to="/signup" className="w-full md:w-auto">
                <Button
                  className="w-full md:w-auto bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-8 py-5 sm:py-6 text-sm sm:text-base tracking-wide shadow-[0_0_30px_rgba(30,144,255,0.5)]"
                  data-testid="cta-be-mentor-btn"
                >
                  Be a Mentor
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
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
