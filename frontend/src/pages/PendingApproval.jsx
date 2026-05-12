import { Link, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, ArrowRight } from "lucide-react";

export default function PendingApproval() {
  const { state } = useLocation();
  const email = state?.email;

  return (
    <div className="min-h-screen bg-black text-white" data-testid="pending-page">
      <Header />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24">
        <div className="ea-glass p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#1E90FF]/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
              <Clock className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF] mt-6">
              / account created
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight mt-3">
              Pending admin <span className="text-[#1E90FF]">approval</span>.
            </h1>
            <p className="text-white/70 mt-4 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              Thanks for signing up{email ? <> as <span className="text-white font-semibold">{email}</span></> : ""}.
              Your mentor account is now in review. You'll be able to log in once an admin approves it.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-xl mx-auto">
              {[
                ["Submitted", "Your details are saved."],
                ["In review", "Admin verifies your account."],
                ["Approved", "Log in and pair your bot."],
              ].map(([t, b], i) => (
                <div
                  key={t}
                  className={`p-4 border ${i === 1 ? "border-[#1E90FF]/40 bg-[#1E90FF]/5" : "border-white/10"}`}
                  data-testid={`pending-step-${i}`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${i === 0 ? "text-[#1E90FF]" : "text-white/30"}`} />
                    <span className="text-[10px] tracking-[0.25em] uppercase text-white/60">{t}</span>
                  </div>
                  <div className="text-sm text-white/70 mt-2">{b}</div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/">
                <Button
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none px-6 h-12 w-full sm:w-auto"
                  data-testid="pending-home-btn"
                >
                  Back to home <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  variant="ghost"
                  className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-6 h-12 w-full sm:w-auto"
                  data-testid="pending-login-btn"
                >
                  Already approved? Login
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
