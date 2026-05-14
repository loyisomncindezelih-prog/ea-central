import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, ArrowRight, CreditCard, AlertCircle } from "lucide-react";

const PRICE_LABEL = "R439.00";

export default function PendingApproval() {
  const { state } = useLocation();
  const [params] = useSearchParams();
  const email = state?.email || params.get("email") || "";
  const [paymentClicked, setPaymentClicked] = useState(null); // null = unknown / not yet checked

  useEffect(() => {
    let cancelled = false;
    if (!email) return;
    // Public probe — uses /verify-account/click flow status info we have. We can't
    // hit /verify-account/status (auth-only), so we just rely on whether the user
    // already came back here after clicking pay.
    api.post("/mobile/check-email", { email })
      .then(() => { if (!cancelled) setPaymentClicked(true); /* approved already */ })
      .catch((err) => {
        if (cancelled) return;
        const detail = err.response?.data?.detail;
        // If we get the "pending admin approval" 403, payment may or may not be clicked.
        // We leave paymentClicked as `null` so we still show the "complete payment" CTA softly.
        if (err.response?.status === 403) setPaymentClicked(false);
      });
    return () => { cancelled = true; };
  }, [email]);

  const showPayCta = paymentClicked !== true; // hide if account is already approved

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
              Almost there.
            </h1>
            <p className="text-white/70 mt-4 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              Thanks for signing up{email ? <> as <span className="text-white font-semibold">{email}</span></> : ""}.
              Complete the <span className="text-[#1E90FF] font-semibold">{PRICE_LABEL}</span> verification payment,
              then an admin will approve your mentor dashboard.
            </p>

            {showPayCta && (
              <div className="mt-8 mx-auto max-w-md border border-[#1E90FF]/50 bg-[#1E90FF]/[0.07] p-5 flex flex-col gap-3" data-testid="pending-pay-cta">
                <div className="flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase text-[#1E90FF]">
                  <AlertCircle className="w-3.5 h-3.5" /> Step 1 — complete payment
                </div>
                <p className="text-white/75 text-sm">
                  Your account is not unlocked until the {PRICE_LABEL} verification fee is paid.
                </p>
                <Link to={`/verify-account?email=${encodeURIComponent(email)}`}>
                  <Button className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 mt-1" data-testid="pending-pay-btn">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Pay {PRICE_LABEL} now
                  </Button>
                </Link>
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-xl mx-auto">
              {[
                ["Submitted", "Your details are saved."],
                ["Payment", `Pay ${PRICE_LABEL} via Yoco.`],
                ["Approved", "Admin verifies, then log in."],
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
                  variant="ghost"
                  className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-6 h-12 w-full sm:w-auto"
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
