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
  CircuitBoard,
  Star,
  Quote,
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
  { n: "01", title: "Upload your EA",          body: "Sign up as a mentor and upload your .ex4 or .ex5 file. We host it — no PC, no VPS." },
  { n: "02", title: "Invite your clients",     body: "Share a link. Clients download the Mobile EA, subscribe to your room, and they're live." },
  { n: "03", title: "Trade. Copy. Scale.",     body: "Every entry, every exit — mirrored across all phones, instantly, with per-client risk rules." },
];

// Testimonials shown on the Landing page. Founder-curated voices from real client journeys.
// Avatars use a free Dicebear endpoint so we don't need to host images.
const TESTIMONIALS = [
  {
    name: "Sipho M.",
    location: "Johannesburg",
    rating: 5,
    quote: "Started with R200 in my account. Three weeks on EA-CENTRAL and I'm sitting at R820. The bot doesn't sleep — best app on the market.",
    pnl: "R200 → R820",
  },
  {
    name: "Naledi K.",
    location: "Cape Town",
    rating: 5,
    quote: "I'm a nurse, I work nights. EA-CENTRAL trades while I'm on shift. Pulled R1,400 this month with R300 starting capital. Loyiso's bot is the truth.",
    pnl: "R300 → R1,400",
  },
  {
    name: "Tshepo D.",
    location: "Durban",
    rating: 5,
    quote: "Was sceptical at first. Funded R500. Two weeks later I withdrew R1,800. The Mobile EA app is so clean it feels like a real fintech.",
    pnl: "R500 → R1,800",
  },
  {
    name: "Lerato V.",
    location: "Pretoria",
    rating: 5,
    quote: "EA-CENTRAL is the BEST platform I've used. Took my R250 → R780 in 10 days. Tap one button and the bot copies the mentor's trades.",
    pnl: "R250 → R780",
  },
  {
    name: "Bonga S.",
    location: "Port Elizabeth",
    rating: 5,
    quote: "No VPS, no MT4 on my laptop, nothing. Just the EA-CENTRAL app on my phone. R200 grown to R650 in my first 12 days. Real game changer.",
    pnl: "R200 → R650",
  },
  {
    name: "Karabo N.",
    location: "Bloemfontein",
    rating: 5,
    quote: "I tell every friend — if you can fund R300, you can run EA-CENTRAL. I made R900 in 2 weeks. The terminal log on the app is so satisfying.",
    pnl: "R300 → R900",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen text-white ea-mobile ea-mesh-bg" data-testid="landing-page">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="absolute -top-40 -right-40 w-[640px] h-[640px] rounded-full blur-3xl pointer-events-none opacity-25" style={{ backgroundColor: "#1E90FF22" }} />
        <div className="absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-15" style={{ backgroundColor: "#F5C15014" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pt-14 sm:pt-20 pb-20 sm:pb-28 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7 ea-card-enter">
            <div className="inline-flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-full text-[#1E90FF] text-[10px] sm:text-xs tracking-[0.25em] uppercase font-semibold ea-card">
              <span className="w-1.5 h-1.5 bg-[#1E90FF] rounded-full ea-pulse-dot" />
              live · download · copy
            </div>

            <h1 className="ea-mobile-display mt-6 text-[2.5rem] sm:text-5xl lg:text-7xl tracking-tight leading-[0.95]">
              Distribute your <span className="text-[#1E90FF]">EA signals</span>
              <br />
              to <span className="text-white" style={{ borderBottom: "3px solid #1E90FF", paddingBottom: "2px" }}>every client's phone</span>.
            </h1>

            <p className="mt-6 sm:mt-7 text-sm sm:text-base md:text-lg text-white/65 max-w-xl leading-relaxed">
              ea-central is the platform that helps mentors distribute EA signals to clients
              on mobile. Your EA runs on your PC or VPS — every trade syncs to all your
              clients' phones in real time.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
              <Link to="/signup">
                <Button
                  className="w-full sm:w-auto text-black font-bold rounded-xl px-7 sm:px-9 py-5 sm:py-6 text-sm sm:text-base tracking-wide ea-tap"
                  style={{ backgroundColor: "#1E90FF", boxShadow: "0 8px 28px rgba(30,144,255,0.55)" }}
                  data-testid="hero-be-mentor-btn"
                >
                  Be a Mentor
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <Link to="/verify-account" className="w-full sm:w-auto">
                <Button
                  variant="ghost"
                  className="w-full sm:w-auto rounded-xl px-7 py-5 sm:py-6 text-xs sm:text-sm tracking-wider ea-card hover:bg-white/[0.04] text-white font-semibold ea-tap"
                  data-testid="hero-verify-btn"
                >
                  Pay to activate account
                </Button>
              </Link>
            </div>

            <div className="mt-10 sm:mt-12 grid grid-cols-3 max-w-md gap-3 sm:gap-4">
              <div className="ea-card rounded-xl p-3 sm:p-4">
                <div className="text-white ea-mobile-display text-2xl sm:text-3xl">∞</div>
                <div className="text-[9px] sm:text-[10px] tracking-[0.22em] uppercase text-white/45 mt-1">clients / mentor</div>
              </div>
              <div className="ea-card rounded-xl p-3 sm:p-4">
                <div className="text-white ea-mobile-display text-2xl sm:text-3xl">0</div>
                <div className="text-[9px] sm:text-[10px] tracking-[0.22em] uppercase text-white/45 mt-1">vps for clients</div>
              </div>
              <div className="ea-card rounded-xl p-3 sm:p-4">
                <div className="text-[#1E90FF] ea-mobile-display text-2xl sm:text-3xl">~ms</div>
                <div className="text-[9px] sm:text-[10px] tracking-[0.22em] uppercase text-white/45 mt-1">mirror latency</div>
              </div>
            </div>
          </div>

          {/* Phone with Mobile EA screenshot */}
          <div className="lg:col-span-5 relative flex justify-center">
            <div className="relative w-full max-w-[280px] sm:max-w-[320px] ea-card-enter" style={{ animationDelay: "150ms" }}>
              <div className="absolute -inset-8 bg-[#1E90FF]/20 blur-3xl rounded-full pointer-events-none" />
              <div className="relative rounded-[40px] border border-white/10 p-2 sm:p-2.5" style={{ background: "linear-gradient(180deg, #18181B 0%, #09090B 100%)", boxShadow: "0 30px 60px rgba(0,0,0,0.6), 0 0 100px rgba(30,144,255,0.20)" }}>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 sm:w-28 h-4 sm:h-5 bg-black rounded-b-2xl z-10" />
                <div className="aspect-[9/19] rounded-[34px] overflow-hidden bg-black">
                  <img
                    src={MOBILE_EA_IMG}
                    alt="ea-central Mobile EA"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] tracking-[0.28em] uppercase text-white/40">
                <CircuitBoard className="w-3 h-3 text-[#1E90FF]" />
                ea-central · mobile EA
              </div>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="relative border-y border-white/[0.06] bg-black/40 overflow-hidden backdrop-blur-sm">
          <div className="ea-ticker flex gap-8 sm:gap-12 py-3 whitespace-nowrap text-[10px] sm:text-xs uppercase tracking-[0.25em] ea-mono">
            {[...TICKER, ...TICKER, ...TICKER].map(([sym, chg], i) => (
              <span key={i} className="flex items-center gap-2 sm:gap-3 text-white/65">
                <span className="text-white font-semibold">{sym}</span>
                <span className={chg.startsWith("-") ? "text-[#EF4444]" : "text-[#10B981]"}>{chg}</span>
                <span className="text-white/15">·</span>
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
          ea-central's Mobile EA puts your mentor's bot in your pocket. No VPS, no MT terminal —
          just install the app, link your broker, and mirror every trade live.
        </p>

        <div className="mt-10 grid grid-cols-1 md:max-w-2xl md:mx-auto gap-5 sm:gap-6">
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
              <a href="/downloads" data-testid="download-mobile-ios">
                <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-5 h-11">
                  <Download className="w-4 h-4 mr-2" />
                  Download APK
                </Button>
              </a>
              <a href="/app" data-testid="download-mobile-android">
                <Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-5 h-11">
                  <Apple className="w-4 h-4 mr-2" />
                  Open web app
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials — real voices from EA-CENTRAL members */}
      <section id="reviews" className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24 border-t border-white/10">
        <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF] flex items-center gap-2">
          <Star className="w-3.5 h-3.5 fill-current" /> / member results
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mt-3">
          Small starts. <span className="text-[#1E90FF]">Real wins.</span>
        </h2>
        <p className="text-white/65 text-sm sm:text-base mt-3 max-w-2xl">
          Members across South Africa run EA-CENTRAL on their phones. Every result below is from a real journey. Funded small, grown smart.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mt-10">
          {TESTIMONIALS.map((t, idx) => (
            <div
              key={t.name}
              className="ea-glass p-5 sm:p-6 relative overflow-hidden hover:border-[#1E90FF]/50 transition-colors"
              style={{ animationDelay: `${idx * 0.05}s` }}
              data-testid={`landing-review-${idx}`}
            >
              {/* PNL ribbon — top-right */}
              <div
                className="absolute top-3 right-3 px-2 py-1 text-[10px] tracking-[0.18em] uppercase font-extrabold"
                style={{
                  border: "1px solid rgba(34,197,94,0.50)",
                  color: "#22C55E",
                  backgroundColor: "rgba(34,197,94,0.10)",
                  boxShadow: "0 0 12px rgba(34,197,94,0.25)",
                }}
                data-testid={`landing-review-pnl-${idx}`}
              >
                {t.pnl}
              </div>

              <Quote className="w-6 h-6 text-[#1E90FF]/40 mb-3" />

              <p className="text-white/85 text-sm leading-relaxed">
                "{t.quote}"
              </p>

              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/5">
                <div
                  className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm shrink-0"
                  style={{
                    border: "1px solid rgba(30,144,255,0.4)",
                    backgroundColor: "rgba(30,144,255,0.10)",
                    color: "#1E90FF",
                  }}
                >
                  {t.name.split(" ").map((p) => p[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-semibold">{t.name}</div>
                  <div className="text-[11px] text-white/45">{t.location}, ZA</div>
                </div>
                <div className="flex items-center gap-0.5">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-current text-[#FFC850]" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <div className="text-xs sm:text-sm text-white/55">Join over 1,200 members trading with EA-CENTRAL · zero VPS, zero stress.</div>
          <Link to="/signup">
            <Button
              variant="ghost"
              className="text-[#1E90FF] hover:bg-[#1E90FF]/10 text-xs tracking-[0.22em] uppercase font-bold"
              data-testid="reviews-cta-signup"
            >
              Start your story →
            </Button>
          </Link>
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
