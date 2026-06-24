import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Crown,
  GraduationCap,
  Copy,
  CheckCircle2,
  ArrowLeft,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// Top-up flow for clients on the base "EA Access Only" tier. They've already paid
// R700; another R700 EFT to the SAME bank details bumps them up to "EA + Mentorship
// Access". Admin reconciles the second proof from the dashboard.
export default function UpgradeMentorship() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [copiedField, setCopiedField] = useState("");
  const alreadyMentorship = !!user?.wants_mentorship;

  useEffect(() => {
    api.get("/verify-account/config").then((r) => setCfg(r.data)).catch(() => { /* ignore */ });
  }, []);

  const copy = (label, value) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopiedField(""), 1800);
  };

  if (alreadyMentorship) {
    return (
      <MentorLayout>
        <div className="max-w-2xl mx-auto pt-12 text-center" data-testid="upgrade-already-mentorship">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(245,193,80,0.10)", color: "#F5C150", border: "1px solid rgba(245,193,80,0.4)" }}>
            <Crown className="w-7 h-7" />
          </div>
          <h1 className="ea-mobile-display text-3xl sm:text-4xl mt-4">You&apos;re already on the full tier.</h1>
          <p className="text-white/60 mt-3">EA + Mentorship Access is active — nothing more to pay.</p>
          <Link to="/dashboard" className="inline-flex items-center gap-2 mt-7 text-[#1E90FF] hover:underline text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
        </div>
      </MentorLayout>
    );
  }

  const bank = cfg?.eft || {};
  const waNumber = cfg?.whatsapp?.number || "";
  const waText = encodeURIComponent(`Hi, I just topped up R700 for the EA + Mentorship upgrade. My email: ${user?.email}. Please verify and upgrade my access.`);

  return (
    <MentorLayout>
      <div className="max-w-3xl mx-auto" data-testid="upgrade-mentorship-page">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-xs tracking-[0.18em] uppercase">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>

        {/* Hero */}
        <div
          className="mt-4 rounded-3xl p-6 sm:p-8 ea-card-elevated ea-card-enter"
          style={{ borderColor: "rgba(245,193,80,0.40)", background: "linear-gradient(135deg, rgba(245,193,80,0.12) 0%, rgba(0,0,0,0) 65%)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(245,193,80,0.15)", color: "#F5C150", border: "1px solid rgba(245,193,80,0.4)" }}>
              <Crown className="w-6 h-6" />
            </div>
            <div className="text-[10px] tracking-[0.32em] uppercase" style={{ color: "#F5C150" }}>/ premium upgrade</div>
          </div>
          <h1 className="ea-mobile-display text-3xl sm:text-5xl mt-4 leading-[1.05] tracking-tight">
            Unlock
            <br />
            <span style={{ color: "#F5C150" }}>EA + Mentorship.</span>
          </h1>
          <p className="text-white/65 text-sm sm:text-base mt-4 max-w-xl leading-relaxed">
            You&apos;re currently on <span className="text-white font-semibold">EA Access Only</span>. Top up the difference and get a direct mentor — better trades, real coaching, faster growth.
          </p>

          {/* Benefits row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            <Benefit icon={GraduationCap} title="1-on-1 mentor" body="Personal guidance from a real trader, not just the EA." />
            <Benefit icon={Sparkles} title="Better setups" body="Hand-picked entries when the market is right." />
            <Benefit icon={ShieldCheck} title="Risk reviewed" body="Mentor reviews your lot sizing so you stay safe." />
          </div>
        </div>

        {/* Payment instructions */}
        <div className="mt-6 ea-card-elevated rounded-3xl p-6 sm:p-7 ea-card-enter" style={{ animationDelay: "0.08s" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/45">Top up</div>
              <div className="ea-mobile-display text-2xl text-white mt-1">EFT R700.00</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/45">Total paid will be</div>
              <div className="font-mono text-white/85 mt-1">R{Number(bank.amount || 700) + 700 || 1450}</div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <BankRow label="Bank"           value={bank.bank_name}      onCopy={() => copy("Bank", bank.bank_name)} copied={copiedField === "Bank"} />
            <BankRow label="Account holder" value={bank.holder}         onCopy={() => copy("Account holder", bank.holder)} copied={copiedField === "Account holder"} />
            <BankRow label="Account #"      value={bank.account}        onCopy={() => copy("Account #", bank.account)} copied={copiedField === "Account #"} mono />
            <BankRow label="Branch code"    value={bank.branch_code}    onCopy={() => copy("Branch code", bank.branch_code)} copied={copiedField === "Branch code"} mono />
            <BankRow label="Account type"   value={bank.account_type}   onCopy={() => copy("Account type", bank.account_type)} copied={copiedField === "Account type"} />
            <BankRow label="Reference"      value={`MENTOR-${user?.email}`} onCopy={() => copy("Reference", `MENTOR-${user?.email}`)} copied={copiedField === "Reference"} mono />
            <BankRow label="Amount"         value={`R700.00`}             onCopy={() => copy("Amount", "700.00")} copied={copiedField === "Amount"} mono accent />
          </div>

          <p className="text-[11px] text-white/50 mt-5 leading-relaxed">
            Use the reference above so admin can match your payment to your email. Once verified, your access tier flips to <span className="text-white">EA + Mentorship Access</span> automatically — usually within a few hours.
          </p>

          {waNumber && (
            <a
              href={`https://wa.me/${waNumber.replace(/\D/g, "")}?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-black font-bold text-sm tracking-[0.05em]"
              style={{ background: "#25D366", boxShadow: "0 10px 28px rgba(37,211,102,0.45)" }}
              data-testid="upgrade-whatsapp"
            >
              <MessageCircle className="w-4 h-4" /> Send proof on WhatsApp
            </a>
          )}
        </div>
      </div>
    </MentorLayout>
  );
}

function Benefit({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl p-4 ea-card">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(245,193,80,0.10)", color: "#F5C150", border: "1px solid rgba(245,193,80,0.30)" }}>
        <Icon className="w-4 h-4" strokeWidth={1.8} />
      </div>
      <div className="text-sm font-semibold text-white mt-3">{title}</div>
      <div className="text-[11px] text-white/55 mt-1 leading-relaxed">{body}</div>
    </div>
  );
}

function BankRow({ label, value, onCopy, copied, mono, accent }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left ea-tap"
      style={{
        borderColor: accent ? "rgba(245,193,80,0.40)" : "rgba(255,255,255,0.08)",
        backgroundColor: accent ? "rgba(245,193,80,0.08)" : "rgba(255,255,255,0.02)",
      }}
      data-testid={`bank-row-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <div className="min-w-0">
        <div className="text-[9px] tracking-[0.22em] uppercase text-white/45">{label}</div>
        <div className={`text-sm text-white mt-0.5 truncate ${mono ? "ea-mono" : "font-semibold"}`} title={value || ""}>
          {value || "—"}
        </div>
      </div>
      {copied ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#22C55E" }} />
      ) : (
        <Copy className="w-4 h-4 text-white/40 shrink-0" />
      )}
    </button>
  );
}
