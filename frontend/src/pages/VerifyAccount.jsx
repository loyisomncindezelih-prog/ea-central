import { useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, CreditCard, ArrowRight, CheckCircle2 } from "lucide-react";

export default function VerifyAccount() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/verify-account/click", { email });
      setDone(true);
      toast.success("Redirecting to payment…");
      setTimeout(() => {
        window.open(data.payment_link, "_blank");
      }, 800);
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
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF] mt-6 text-center">/ verify account</div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight mt-3 text-center">
              Verify with <span className="text-[#1E90FF]">payment</span>.
            </h1>
            <p className="text-white/65 text-sm mt-3 text-center max-w-lg mx-auto">
              Enter the email tied to your ea-central account, then complete payment. Once we confirm payment,
              your mentor account will be fully verified.
            </p>

            {done ? (
              <div className="mt-10 text-center" data-testid="verify-done">
                <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs tracking-[0.22em] uppercase">payment link opened</span>
                </div>
                <p className="text-white/65 text-sm mt-5 max-w-md mx-auto">
                  If the payment page didn't open, click the button below. Our admin team has been
                  notified to verify your payment shortly.
                </p>
                <Button
                  onClick={() => api.get("/verify-account/config").then(r => window.open(r.data.payment_link, "_blank"))}
                  className="mt-5 bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-6"
                  data-testid="verify-reopen"
                >
                  Open payment page again
                </Button>
                <div className="mt-8">
                  <Link to="/dashboard" className="text-xs tracking-[0.22em] uppercase text-white/55 hover:text-[#1E90FF]">
                    ← Back to dashboard
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-10 max-w-md mx-auto space-y-5" data-testid="verify-form">
                <div>
                  <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">Email</Label>
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
                  {loading ? "Opening…" : "Pay to verify"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-[10px] tracking-[0.22em] uppercase text-white/35 text-center pt-2">
                  After payment, our admin will mark your account verified
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
