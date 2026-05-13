import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Apple, Smartphone, Download } from "lucide-react";

const MOBILE_EA_IMG =
  "https://customer-assets.emergentagent.com/job_copy-trading-hub-2/artifacts/ukmwnbqz_ChatGPT%20Image%20May%2013%2C%202026%2C%2009_34_45%20PM.png";

export default function MobilePreview() {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="mobile-preview-page">
      <Header />

      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-12 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-6 order-2 lg:order-1">
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">
              / client experience
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight mt-4 leading-[1]">
              The mobile EA your <br />
              <span className="text-[#1E90FF]">clients</span> download.
            </h1>
            <p className="mt-5 text-white/65 text-sm sm:text-base max-w-lg leading-relaxed">
              Clean, fast, on-brand. No MetaTrader, no VPS. Clients install the ea-central
              Mobile EA on their phone and copy every trade you run on your PC bot.
            </p>

            <div className="mt-8 space-y-4">
              {[
                ["One-tap start", "Hit START TRADES — auto-copy begins instantly."],
                ["Broker connection", "Link any supported broker right inside the app."],
                ["EA license", "Activate with the license key issued by their mentor."],
                ["Zero install on desktop", "No MT terminal, no VPS — just the app."],
              ].map(([t, b]) => (
                <div key={t} className="flex gap-4 items-start" data-testid={`mp-feature-${t}`}>
                  <div className="w-2 h-2 mt-2 bg-[#1E90FF] rounded-full shrink-0" />
                  <div>
                    <div className="font-display font-semibold">{t}</div>
                    <div className="text-sm text-white/55 leading-relaxed">{b}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <a href="/app" data-testid="mp-download-ios">
                <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-5 h-12">
                  <Apple className="w-4 h-4 mr-2" />
                  Open Mobile EA
                </Button>
              </a>
              <a href="/app" data-testid="mp-download-android">
                <Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-5 h-12">
                  <Smartphone className="w-4 h-4 mr-2" />
                  Launch web app
                </Button>
              </a>
            </div>
          </div>

          {/* Phone with real EA screenshot */}
          <div className="lg:col-span-6 order-1 lg:order-2 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-10 bg-[#1E90FF]/25 blur-3xl rounded-full pointer-events-none" />
              <div
                className="relative w-[280px] sm:w-[320px] md:w-[360px] aspect-[9/19] rounded-[44px] border border-white/15 bg-[#050505] p-2 sm:p-3 shadow-[0_0_60px_rgba(30,144,255,0.3)]"
                data-testid="phone-mock"
              >
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 sm:w-32 h-6 bg-black rounded-b-2xl z-10" />
                <div className="w-full h-full rounded-[36px] overflow-hidden bg-black">
                  <img
                    src={MOBILE_EA_IMG}
                    alt="ea-central Mobile EA"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/40">
                <Download className="w-3 h-3 text-[#1E90FF]" />
                ea-central · mobile EA preview
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
