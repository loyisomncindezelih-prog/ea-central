import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { XCircle, RotateCcw, ArrowLeft } from "lucide-react";

export default function PaymentCancelled() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get("email") || "";
  const reason = params.get("status") || "cancelled"; // cancelled | failed
  const [loading, setLoading] = useState(false);

  const retry = async () => {
    // EFT flow — just bounce back to /verify-account with the email pre-filled.
    // The bank details + WhatsApp button live on that page.
    if (email) {
      navigate(`/verify-account?email=${encodeURIComponent(email)}`);
    } else {
      navigate("/verify-account");
    }
  };

  const isFailed = reason === "failed";

  return (
    <div className="min-h-screen bg-black text-white" data-testid="payment-cancelled-page">
      <Header />
      <section className="max-w-2xl mx-auto px-4 sm:px-6 md:px-10 py-16 sm:py-24">
        <div className="ea-glass p-8 sm:p-12 text-center relative overflow-hidden">
          <div className={`absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none ${isFailed ? "bg-[#FF3B3B]/20" : "bg-[#FFC850]/20"}`} />
          <div className="relative">
            <div className={`w-16 h-16 mx-auto flex items-center justify-center rounded-full border ${isFailed ? "border-[#FF3B3B]/60 bg-[#FF3B3B]/15 text-[#FF3B3B]" : "border-[#FFC850]/60 bg-[#FFC850]/15 text-[#FFC850]"} mb-4`}>
              <XCircle className="w-8 h-8" strokeWidth={1.6} />
            </div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-white/55">
              / payment {isFailed ? "failed" : "cancelled"}
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight mt-3">
              {isFailed ? <>Couldn't <span className="text-[#FF3B3B]">complete</span>.</> : <>Not <span className="text-[#FFC850]">finalised</span>.</>}
            </h1>
            <p className="text-white/70 mt-4 text-sm sm:text-base">
              {isFailed
                ? "Yoco couldn't complete the charge. This is usually a card decline — try a different card or contact your bank."
                : "You cancelled the R700.00 verification payment. No charge was made. You can try again any time."}
            </p>

            {email && (
              <div className="mt-4 text-[11px] tracking-[0.22em] uppercase text-white/40">
                {email}
              </div>
            )}

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={retry} disabled={loading} className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 px-6 tracking-wide" data-testid="payment-retry-btn">
                <RotateCcw className="w-4 h-4 mr-2" />
                {loading ? "Opening…" : "Retry payment"}
              </Button>
              <Link to="/">
                <Button variant="ghost" className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none px-6 h-12 w-full sm:w-auto" data-testid="payment-cancel-home-btn">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back home
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
