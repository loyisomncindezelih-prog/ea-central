import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Copy,
  Clock,
  ExternalLink,
  Landmark,
  Upload,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const PRICE_LABEL = "R500.00";
const PRICE_SUBLABEL = "ZAR · one-time verification";
const MAX_PROOF_MB = 5;

// Open WhatsApp with a pre-filled message. `number` may include "+" — strip non-digits.
function openWhatsApp({ number, template, email, license }) {
  if (!number) {
    toast.error("WhatsApp number not configured yet.");
    return;
  }
  const cleanNumber = number.replace(/[^\d]/g, "");
  const message = (template || "I just made the payment for ea-central. My email: {{email}}.")
    .replaceAll("{{email}}", email || "")
    .replaceAll("{{license}}", license || "");
  const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener");
}

const BankRow = ({ label, value, copyLabel, testid }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${copyLabel || label} copied`);
    } catch {
      toast.error("Couldn't copy — please copy manually");
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">{label}</div>
        <div className="text-white font-mono truncate" data-testid={testid}>{value || "—"}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 w-9 h-9 flex items-center justify-center border border-[#1E90FF]/55 text-[#1E90FF] hover:bg-[#1E90FF]/10 transition"
        data-testid={`${testid}-copy`}
        aria-label={`Copy ${label}`}
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
};

export default function VerifyAccount() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const [email, setEmail] = useState(params.get("email") || "");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState("form"); // form | bank | paid-pending | already-approved
  const [cfg, setCfg] = useState(null);
  const [proofName, setProofName] = useState("");
  const [proofUploaded, setProofUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Pull bank + whatsapp config once on mount so we can render the EFT card.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/verify-account/config");
        setCfg(data);
      } catch { /* ignored — fallbacks shown in UI */ }
    })();
  }, []);

  useEffect(() => {
    if (isNew && email) toast.info(`Almost there, ${email} — send ${PRICE_LABEL} via EFT to unlock your mentor dashboard.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1: check the user's account status before showing the bank details.
  const startPayment = async (e) => {
    e?.preventDefault?.();
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
        setState("paid-pending");
        return;
      }
      // Happy path — surface the bank details.
      setState("bank");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProofUpload = async (file) => {
    if (!file) return;
    if (file.size > MAX_PROOF_MB * 1024 * 1024) {
      toast.error(`File is too large. Max ${MAX_PROOF_MB}MB.`);
      return;
    }
    const allowed = ["image/", "application/pdf"];
    if (!allowed.some((t) => file.type.startsWith(t))) {
      toast.error("Please upload an image or PDF.");
      return;
    }
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      await api.post("/verify-account/proof", { email, proof_data_url: dataUrl, filename: file.name });
      setProofName(file.name);
      setProofUploaded(true);
      toast.success("Proof of payment uploaded ✓");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploading(false);
    }
  };

  const onIPaid = () => {
    if (!proofUploaded) {
      toast.error("Please upload your proof of payment first.");
      return;
    }
    if (!cfg?.whatsapp?.number) {
      toast.error("WhatsApp number not configured. Please contact support.");
      return;
    }
    openWhatsApp({
      number: cfg.whatsapp.number,
      template: cfg.whatsapp.template,
      email,
    });
    setState("paid-pending");
  };

  const eft = cfg?.eft || {};
  const amount = eft.amount ? `R${eft.amount}` : PRICE_LABEL;

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
              Unlock with <span className="text-[#1E90FF]">EFT payment</span>.
            </h1>
            <p className="text-white/65 text-sm mt-3 text-center max-w-lg mx-auto">
              Mentor accounts are activated once we receive your one-time verification payment.
              Send the amount below via EFT, then tap <span className="text-[#1E90FF] font-semibold">I paid</span> to send proof on WhatsApp.
              An admin will activate your dashboard shortly after.
            </p>

            {/* Price plate */}
            <div
              className="mt-8 mx-auto max-w-sm border border-[#1E90FF]/50 bg-[#1E90FF]/[0.07] p-5 text-center"
              data-testid="verify-price-plate"
            >
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/55">Verification fee</div>
              <div className="font-display text-4xl sm:text-5xl font-black tracking-tight text-[#1E90FF] mt-1" data-testid="verify-price">
                {amount}
              </div>
              <div className="text-[11px] tracking-[0.22em] uppercase text-white/45 mt-1">{PRICE_SUBLABEL}</div>
              <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-white/55">
                <Landmark className="w-3 h-3 text-[#1E90FF]" />
                Manual EFT · admin verifies on WhatsApp
              </div>
            </div>

            {state === "already-approved" && (
              <div className="mt-10 text-center" data-testid="verify-already-approved">
                <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs tracking-[0.22em] uppercase">already approved</span>
                </div>
                <p className="text-white/65 text-sm mt-5 max-w-md mx-auto">Your account is already active. Sending you to login…</p>
              </div>
            )}

            {state === "paid-pending" && (
              <div className="mt-10 text-center" data-testid="verify-done">
                <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs tracking-[0.22em] uppercase">awaiting admin verification</span>
                </div>
                <p className="text-white/65 text-sm mt-5 max-w-md mx-auto">
                  We've noted your payment. Once an admin matches the EFT in our bank account,
                  your dashboard will open and you'll be able to log in.
                </p>
                <Button
                  onClick={onIPaid}
                  className="mt-5 bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-6"
                  data-testid="verify-reopen-whatsapp"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Send proof on WhatsApp again
                </Button>
                <div className="mt-8">
                  <Link to="/login" className="text-xs tracking-[0.22em] uppercase text-white/55 hover:text-[#1E90FF]" data-testid="verify-to-login">
                    Already approved? Login →
                  </Link>
                </div>
              </div>
            )}

            {state === "bank" && (
              <div className="mt-8 max-w-md mx-auto" data-testid="verify-bank-card">
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-3 text-center">/ pay via EFT</div>

                {/* Immediate payment warning — critical for SA banks: standard EFT can take 24-48h */}
                <div
                  className="mb-3 flex items-start gap-2 border border-[#FFC850]/55 bg-[#FFC850]/[0.08] px-3 py-2.5"
                  data-testid="verify-immediate-warning"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#FFC850]" />
                  <div className="text-xs text-white/85 leading-relaxed">
                    <span className="font-bold text-[#FFC850]">Use IMMEDIATE / PayShap payment</span> only.
                    Standard EFT takes 24–48 hours and your account won't activate until it reflects.
                  </div>
                </div>

                <div className="border border-[#1E90FF]/40 bg-black/40 px-5 py-3">
                  <BankRow label="Bank"          value={eft.bank_name}    testid="bank-name" />
                  <BankRow label="Account holder" value={eft.holder}       testid="bank-holder" />
                  <BankRow label="Account number" value={eft.account}      testid="bank-account" />
                  <BankRow label="Branch code"    value={eft.branch_code}  testid="bank-branch" />
                  <BankRow label="Account type"   value={eft.account_type} testid="bank-type" />
                  <BankRow label="Reference"      value={email || "your email"} testid="bank-ref" copyLabel="Reference" />
                  <BankRow label="Amount"         value={amount}           testid="bank-amount" />
                </div>

                {/* Proof of payment upload (required) */}
                <label
                  className="mt-4 block cursor-pointer"
                  data-testid="verify-proof-uploader"
                >
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleProofUpload(e.target.files?.[0])}
                    data-testid="verify-proof-input"
                  />
                  <div
                    className={`flex items-center gap-3 px-4 py-3 transition ${
                      proofUploaded
                        ? "border border-[#22C55E]/60 bg-[#22C55E]/[0.08]"
                        : "border border-dashed border-[#1E90FF]/50 bg-[#1E90FF]/[0.04] hover:bg-[#1E90FF]/[0.08]"
                    }`}
                  >
                    {uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#1E90FF]" />
                    ) : proofUploaded ? (
                      <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                    ) : (
                      <Upload className="w-5 h-5 text-[#1E90FF]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs tracking-[0.22em] uppercase font-bold ${proofUploaded ? "text-[#22C55E]" : "text-[#1E90FF]"}`}>
                        {uploading ? "Uploading…" : proofUploaded ? "Proof uploaded" : "Upload proof of payment"}
                      </div>
                      <div className="text-[11px] text-white/55 truncate mt-0.5">
                        {proofUploaded ? proofName : `Image or PDF · max ${MAX_PROOF_MB}MB`}
                      </div>
                    </div>
                  </div>
                </label>

                <Button
                  onClick={onIPaid}
                  disabled={!proofUploaded || uploading}
                  className="mt-4 w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="verify-i-paid-btn"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  I paid — open WhatsApp
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-[10px] tracking-[0.22em] uppercase text-white/35 text-center pt-3">
                  Use your <span className="text-white/65">email</span> as the EFT reference so we can match it.
                </p>
                <p className="text-[10px] tracking-[0.18em] uppercase text-white/35 text-center pt-1">
                  By paying you accept the <a href="/terms" target="_blank" rel="noopener" className="text-[#1E90FF] hover:underline" data-testid="verify-terms-link">Terms & Conditions</a> · payments are <span className="text-[#FF3B3B]">non-refundable</span>.
                </p>
              </div>
            )}

            {state === "form" && (
              <form onSubmit={startPayment} className="mt-8 max-w-md mx-auto space-y-5" data-testid="verify-form">
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
                  <Landmark className="w-4 h-4 mr-2" />
                  {loading ? "Checking…" : `Show bank details (${amount})`}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-[10px] tracking-[0.22em] uppercase text-white/35 text-center pt-2">
                  We check your account status before showing payment details.
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
