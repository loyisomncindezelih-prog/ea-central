import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const [status, setStatus] = useState(null);
  const [poll, setPoll] = useState(0);

  // Poll the backend until the webhook has confirmed the payment (typically <5s).
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get(`/verify-account/status?email=${encodeURIComponent(email)}`);
        if (cancelled) return;
        setStatus(data);
        if (data.payment_confirmed || data.status === "approved") return; // stop polling
        if (poll < 20) {
          setTimeout(() => setPoll((p) => p + 1), 1500);
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [email, poll]);

  const confirmed = !!(status?.payment_confirmed || status?.status === "approved");
  const approved = status?.status === "approved";

  return (
    <div className="min-h-screen bg-black text-white" data-testid="payment-success-page">
      <Header />
      <section className="max-w-2xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24">
        <div className="ea-glass p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#1E90FF]/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full border border-[#1E90FF]/60 bg-[#1E90FF]/15 text-[#1E90FF] mb-4">
              <CheckCircle2 className="w-8 h-8" strokeWidth={1.6} />
            </div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ payment successful</div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight mt-3">
              {approved ? <>You're <span className="text-[#1E90FF]">in</span>.</>
                       : confirmed ? <>Payment <span className="text-[#1E90FF]">received</span>.</>
                                   : <>Almost <span className="text-[#1E90FF]">there</span>…</>}
            </h1>

            <p className="text-white/70 mt-4 text-sm sm:text-base">
              {approved
                ? "Your mentor account is verified and active. Welcome to ea-central."
                : confirmed
                  ? "Yoco confirmed your payment. Finalising your account…"
                  : "We're confirming your R500.00 payment with Yoco. This usually takes a few seconds."}
            </p>

            {email && (
              <div className="mt-4 text-[11px] tracking-[0.22em] uppercase text-white/40">
                {email}
              </div>
            )}

            {!confirmed && (
              <div className="mt-8 flex items-center justify-center gap-2 text-white/55 text-xs" data-testid="payment-success-waiting">
                <span className="w-2 h-2 rounded-full bg-[#1E90FF] animate-pulse" />
                Awaiting webhook confirmation…
              </div>
            )}

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              {approved ? (
                <Link to="/login">
                  <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 px-6 tracking-wide" data-testid="payment-success-login-btn">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Go to login
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to={`/login?email=${encodeURIComponent(email)}`}>
                    <Button variant="ghost" className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-6 h-12" data-testid="payment-success-login-btn">
                      Try login
                    </Button>
                  </Link>
                  <Link to="/">
                    <Button variant="ghost" className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-6 h-12">
                      Back home
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
