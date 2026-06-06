import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Apple, ShieldCheck, Wifi, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

// All "Download APK" buttons hit /api/app/apk which 302-redirects to the
// APK_DOWNLOAD_URL env var on the backend. This lets you swap the APK by
// editing backend/.env without rebuilding the frontend.
const API_URL = process.env.REACT_APP_BACKEND_URL || "";
const APK_URL = `${API_URL}/api/app/apk`;

export default function Downloads() {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="downloads-page">
      <Header />

      <section className="max-w-5xl mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-16">
        <Link to="/" className="text-[10px] tracking-[0.3em] uppercase text-white/50 hover:text-[#1E90FF] flex items-center gap-1 mb-3" data-testid="downloads-back">
          <ArrowLeft className="w-3 h-3" /> back to home
        </Link>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
          Install the <span className="text-[#1E90FF]">Mobile EA</span>.
        </h1>
        <p className="mt-3 text-white/65 text-sm sm:text-base max-w-2xl">
          One install, lifetime updates. No VPS, no MT terminal — just a license key and your broker.
        </p>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
          {/* Android APK */}
          <div className="ea-glass p-6 sm:p-8" data-testid="downloads-android">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
                <Smartphone className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45">For Android</div>
                <h3 className="font-display text-lg sm:text-xl font-semibold">Direct APK</h3>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/65 leading-relaxed">
              Sideload the EA-CENTRAL Android app. Open the APK on your phone, allow "Install from
              unknown sources" once, and you're in.
            </p>

            <ul className="mt-5 space-y-2 text-xs sm:text-sm text-white/70">
              <li className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-[#1E90FF]" /> Same login, same license — your data is identical to the web app.</li>
              <li className="flex items-center gap-2"><Wifi className="w-3.5 h-3.5 text-[#1E90FF]" /> Auto-updates every time we ship a website change (no Play Store wait).</li>
              <li className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 text-[#1E90FF]" /> Android 6+ (API 23). About 6 MB.</li>
            </ul>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href={APK_URL} download="ea-central.apk" data-testid="downloads-apk-btn">
                <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-5 h-11">
                  <Download className="w-4 h-4 mr-2" />
                  Download .apk
                </Button>
              </a>
              <a href="/app" data-testid="downloads-pwa-btn">
                <Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-5 h-11">
                  Or open in browser
                </Button>
              </a>
            </div>

            <div className="mt-5 text-[10px] tracking-[0.18em] uppercase text-white/40">
              How to install
            </div>
            <ol className="mt-2 text-xs text-white/55 space-y-1.5 list-decimal list-inside">
              <li>Tap <span className="text-white">Download .apk</span> on your Android phone.</li>
              <li>Open the file → if prompted, allow "Install from this source".</li>
              <li>Open EA-CENTRAL, enter your email + license key.</li>
            </ol>
          </div>

          {/* iOS / Other */}
          <div className="ea-glass p-6 sm:p-8" data-testid="downloads-ios">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex items-center justify-center border border-white/15 bg-white/5 text-white/85">
                <Apple className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45">For iPhone</div>
                <h3 className="font-display text-lg sm:text-xl font-semibold">Add to Home Screen</h3>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/65 leading-relaxed">
              iOS doesn't allow sideloading. The good news: our PWA installs to your Home Screen
              just like a native app, with the same icon, splash, and full-screen experience.
            </p>

            <ol className="mt-5 text-xs text-white/65 space-y-1.5 list-decimal list-inside">
              <li>Open <span className="text-[#1E90FF]">/app</span> in <span className="text-white">Safari</span> (not Chrome).</li>
              <li>Tap the <span className="text-white">Share</span> icon at the bottom of the screen.</li>
              <li>Tap <span className="text-white">Add to Home Screen</span>.</li>
              <li>Launch from the icon on your Home Screen — runs in full-screen, offline-ready.</li>
            </ol>

            <div className="mt-6">
              <a href="/app" data-testid="downloads-ios-open-pwa">
                <Button className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-5 h-11">
                  Open /app in Safari
                </Button>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 text-[10px] tracking-[0.22em] uppercase text-white/40 text-center">
          Trouble installing? WhatsApp the admin from your <Link to="/verify-account" className="text-[#1E90FF] underline">verification page</Link>.
        </div>
      </section>

      <Footer />
    </div>
  );
}
