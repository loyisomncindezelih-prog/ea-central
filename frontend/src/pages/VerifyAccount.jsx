import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, CreditCard, ArrowRight, CheckCircle2, Lock, Clock } from "lucide-react";

const PRICE_LABEL = "R439.00";
const PRICE_SUBLABEL = "ZAR · one-time verification";

export default function VerifyAccount() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const [email, setEmail] = useState(params.get("email") || "");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState("form"); // form | paid | already-approved

  useEffect(() => {
    if (isNew && email) toast.info(`Almost there, ${email} — pay ${PRICE_LABEL} to unlock your mentor dashboard.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/verify-account/click", { email });

      if (data.already_approved) {
        toast.success("Your account is already approved — please log in.");
        setState("already-approved");
        setTimeout(() => navigate(`/login?email=${encodeURIComponent(email)}`), 1200);
        return;
      }

      if (data.already_paid) {
        toast.info(data.message || "Payment already received — admin is verifying.");
        setState("paid");
        return;
      }

      // Pending + not yet paid → open Yoco
      toast.success("Redirecting to payment…");
      setState("paid");
      setTimeout(() => window.open(data.payment_link, "_blank"), 800);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white" data-testid="verify-account-page">
      <Header />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-20">
        <div className="ea-glass p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[#1E90FF]/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
              <ShieldCheck className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF] mt-6 text-center">
              / verify mentor account
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight mt-3 text-center">
              Unlock with <span className="text-[#1E90FF]">payment</span>.
            </h1>
            <p className="text-white/65 text-sm mt-3 text-center max-w-lg mx-auto">
              Mentor accounts on ea-central are activated after a one-time verification payment.
              Once we confirm it, an admin verifies your details and your dashboard opens up.
            </p>

            {/* Price plate */}
            <div
              className="mt-8 mx-auto max-w-sm border border-[#1E90FF]/50 bg-[#1E90FF]/[0.07] p-5 text-center"
              data-testid="verify-price-plate"
            >
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/55">Verification fee</div>
              <div className="font-display text-4xl sm:text-5xl font-black tracking-tight text-[#1E90FF] mt-1" data-testid="verify-price">
                {PRICE_LABEL}
              </div>
              <div className="text-[11px] tracking-[0.22em] uppercase text-white/45 mt-1">{PRICE_SUBLABEL}</div>
              <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-white/55">
                <Lock className="w-3 h-3 text-[#1E90FF]" />
                Secure checkout via Yoco
              </div>
            </div>

            {state === "already-approved" && (
              <div className="mt-10 text-center" data-testid="verify-already-approved">
                <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs tracking-[0.22em] uppercase">already approved</span>
                </div>
                <p className="text-white/65 text-sm mt-5 max-w-md mx-auto">
                  Your account is already active. Sending you to login…
                </p>
              </div>
            )}

            {state === "paid" && (
              <div className="mt-10 text-center" data-testid="verify-done">
                <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs tracking-[0.22em] uppercase">awaiting admin approval</span>
                </div>
                <p className="text-white/65 text-sm mt-5 max-w-md mx-auto">
                  If the payment page didn't open, click below. Once we confirm your {PRICE_LABEL} payment on Yoco,
                  an admin will approve your account and you can log in.
                </p>
                <Button
                  onClick={() => api.get("/verify-account/config").then(r => window.open(r.data.payment_link, "_blank"))}
                  className="mt-5 bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-6"
                  data-testid="verify-reopen"
                >
                  Open payment page again
                </Button>
                <div className="mt-8">
                  <Link to="/login" className="text-xs tracking-[0.22em] uppercase text-white/55 hover:text-[#1E90FF]" data-testid="verify-to-login">
                    Already approved? Login →
                  </Link>
                </div>
              </div>
            )}

            {state === "form" && (
              <form onSubmit={submit} className="mt-8 max-w-md mx-auto space-y-5" data-testid="verify-form">
                <div>
                  <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">Email tied to your account</Label>
                  <Input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                    data-testid="verify-email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide"
                  data-testid="verify-pay-btn"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {loading ? "Checking…" : `Pay ${PRICE_LABEL} to verify`}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-[10px] tracking-[0.22em] uppercase text-white/35 text-center pt-2">
                  We check your account status before opening the payment page.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
