import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CountryCodeSelect } from "@/components/CountryCodeSelect";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowRight, Upload, Cpu, AlertCircle, Mail, User, Lock, Phone, Sparkles } from "lucide-react";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    country_code: "+1",
    contact_number: "",
    password: "",
  });
  const [eaFile, setEaFile] = useState(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onEaPick = (file) => {
    if (!file) { setEaFile(null); return; }
    const name = file.name || "";
    const lower = name.toLowerCase();
    if (!lower.endsWith(".ex4") && !lower.endsWith(".ex5")) {
      toast.error("Only .ex4 or .ex5 files are accepted.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("EA file too large. Keep it under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEaFile({ name, dataUrl: String(reader.result || ""), size: file.size });
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!agree) {
      setError("Please accept the Terms & Conditions to continue.");
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form };
      if (eaFile) {
        payload.ea_file_name = eaFile.name;
        payload.ea_file_data_url = eaFile.dataUrl;
      }
      const res = await register(payload);
      toast.success("Account created — complete the R700 payment to unlock your dashboard");
      navigate(`/verify-account?email=${encodeURIComponent(res?.user?.email || form.email)}&new=1`);
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white ea-mobile ea-mesh-bg" data-testid="signup-page">
      <Header />

      <div className="relative overflow-hidden min-h-[calc(100vh-4rem)]">
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-30" style={{ backgroundColor: "#1E90FF1F" }} />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-20" style={{ backgroundColor: "#F5C15014" }} />
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-12 lg:py-16 items-start">
          {/* Left brand panel */}
          <aside className="hidden lg:flex lg:col-span-5 flex-col gap-6 sticky top-20">
            <div className="text-[10px] tracking-[0.32em] uppercase text-[#1E90FF] flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              / mentor onboarding
            </div>
            <h1 className="ea-mobile-display text-5xl xl:text-6xl text-white leading-[0.95]">
              Run a copy trading room
              <br />
              <span className="text-[#1E90FF]">from your terminal.</span>
            </h1>
            <p className="text-white/55 text-sm leading-relaxed max-w-md">
              Sign up once, pair your PC bot, and start onboarding clients to your private Mobile EA. No VPS needed for them.
            </p>

            <div className="mt-2 grid grid-cols-3 gap-3 max-w-md" data-testid="signup-stats">
              <div className="ea-card rounded-xl p-3 text-center">
                <div className="ea-mobile-display text-2xl text-white">∞</div>
                <div className="text-[9px] tracking-[0.25em] uppercase text-white/40 mt-1">clients</div>
              </div>
              <div className="ea-card rounded-xl p-3 text-center">
                <div className="ea-mobile-display text-2xl text-white">0</div>
                <div className="text-[9px] tracking-[0.25em] uppercase text-white/40 mt-1">client vps</div>
              </div>
              <div className="ea-card rounded-xl p-3 text-center">
                <div className="ea-mobile-display text-2xl text-[#1E90FF]">~ms</div>
                <div className="text-[9px] tracking-[0.25em] uppercase text-white/40 mt-1">latency</div>
              </div>
            </div>

            <div className="mt-1 ea-card rounded-xl p-4 max-w-md" data-testid="signup-payment-card">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">One-time activation</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="ea-mobile-display text-3xl text-[#1E90FF]">R700</span>
                <span className="text-[10px] tracking-[0.22em] uppercase text-white/45">· EFT / USDT / Skrill</span>
              </div>
              <div className="text-[11px] text-white/45 mt-2 leading-relaxed">
                Pay after signup. Three payment methods accepted. Admin verifies and your dashboard unlocks.
              </div>
            </div>
          </aside>

          {/* Right form */}
          <div className="lg:col-span-7 flex justify-center w-full">
            <div className="w-full max-w-xl">
              <div className="ea-card-elevated rounded-3xl p-6 sm:p-9 ea-card-enter relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-50" style={{ backgroundColor: "#1E90FF22" }} />

                <div className="relative">
                  <div className="text-[10px] tracking-[0.32em] uppercase text-[#1E90FF]">/ create account</div>
                  <h2 className="ea-mobile-display text-3xl sm:text-4xl text-white mt-2">
                    Become a mentor.
                  </h2>
                  <p className="text-white/55 text-sm mt-2">
                    Already have an account?{" "}
                    <Link to="/login" className="text-[#1E90FF] hover:underline font-semibold" data-testid="signup-to-login">
                      Login here
                    </Link>
                    .
                  </p>

                  <form onSubmit={submit} className="mt-7 space-y-4" data-testid="signup-form">
                    <IconField icon={User} label="Username">
                      <Input
                        required minLength={2}
                        value={form.username}
                        onChange={onChange("username")}
                        placeholder="trader.alpha"
                        className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 pl-11"
                        style={{ borderColor: "rgba(255,255,255,0.08)" }}
                        data-testid="signup-username"
                      />
                    </IconField>

                    <IconField icon={Mail} label="Email">
                      <Input
                        required type="email"
                        value={form.email}
                        onChange={onChange("email")}
                        placeholder="you@domain.com"
                        className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 pl-11"
                        style={{ borderColor: "rgba(255,255,255,0.08)" }}
                        data-testid="signup-email"
                      />
                    </IconField>

                    <div>
                      <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block flex items-center gap-2">
                        <Phone className="w-3 h-3" /> Contact number
                      </label>
                      <div className="flex gap-2">
                        <CountryCodeSelect
                          value={form.country_code}
                          onChange={(v) => setForm((f) => ({ ...f, country_code: v }))}
                          testId="signup-country-code"
                        />
                        <Input
                          required inputMode="tel"
                          value={form.contact_number}
                          onChange={onChange("contact_number")}
                          placeholder="555 123 4567"
                          className="flex-1 bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 px-4"
                          style={{ borderColor: "rgba(255,255,255,0.08)" }}
                          data-testid="signup-contact"
                        />
                      </div>
                    </div>

                    <IconField icon={Lock} label="Password">
                      <Input
                        required minLength={6} type="password"
                        value={form.password}
                        onChange={onChange("password")}
                        placeholder="At least 6 characters"
                        className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 pl-11"
                        style={{ borderColor: "rgba(255,255,255,0.08)" }}
                        data-testid="signup-password"
                      />
                    </IconField>

                    <div>
                      <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">EA file (.ex4 / .ex5) — optional</label>
                      <label
                        htmlFor="ea-file-input"
                        className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer ea-tap"
                        style={{
                          border: eaFile ? "1px solid rgba(16,185,129,0.40)" : "1px dashed rgba(255,255,255,0.18)",
                          backgroundColor: eaFile ? "rgba(16,185,129,0.06)" : "rgba(18,18,20,0.6)",
                        }}
                        data-testid="signup-ea-file-label"
                      >
                        <div
                          className="w-9 h-9 flex items-center justify-center shrink-0 rounded-lg"
                          style={{
                            backgroundColor: eaFile ? "rgba(16,185,129,0.10)" : "rgba(30,144,255,0.10)",
                            color: eaFile ? "#10B981" : "#1E90FF",
                          }}
                        >
                          {eaFile ? <Cpu className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate font-medium">
                            {eaFile ? eaFile.name : "Drop or pick your compiled EA"}
                          </div>
                          <div className="text-[11px] text-white/45 mt-0.5">
                            {eaFile
                              ? `${(eaFile.size / 1024).toFixed(1)} KB · ready to upload`
                              : "MT4 .ex4 · MT5 .ex5 · up to 8 MB · can also add later"}
                          </div>
                        </div>
                        {eaFile && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setEaFile(null); }}
                            className="text-[11px] text-white/55 hover:text-white shrink-0 underline ea-tap"
                            data-testid="signup-ea-file-clear"
                          >
                            remove
                          </button>
                        )}
                        <input
                          id="ea-file-input"
                          type="file"
                          accept=".ex4,.ex5,application/octet-stream"
                          onChange={(e) => onEaPick(e.target.files?.[0])}
                          className="hidden"
                          data-testid="signup-ea-file"
                        />
                      </label>
                    </div>

                    <div className="flex items-start gap-3 pt-2">
                      <Checkbox
                        id="agree"
                        checked={agree}
                        onCheckedChange={(v) => setAgree(Boolean(v))}
                        className="mt-1 border-white/30 data-[state=checked]:bg-[#1E90FF] data-[state=checked]:border-[#1E90FF] data-[state=checked]:text-black"
                        data-testid="signup-agree"
                      />
                      <label htmlFor="agree" className="text-xs text-white/65 leading-relaxed">
                        By creating an account you agree with our{" "}
                        <Link to="/terms" target="_blank" className="text-[#1E90FF] hover:underline font-semibold">Terms & Conditions</Link>{" "}
                        and acknowledge the risks of algorithmic trading.
                      </label>
                    </div>

                    {error && (
                      <div
                        className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                        style={{ border: "1px solid rgba(239,68,68,0.30)", backgroundColor: "rgba(239,68,68,0.06)" }}
                        data-testid="signup-error"
                      >
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#EF4444" }} />
                        <div className="text-xs text-white/85 leading-relaxed">{error}</div>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full text-black font-bold rounded-xl h-12 tracking-wide ea-tap text-sm disabled:opacity-40"
                      style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 22px rgba(30,144,255,0.55)" }}
                      data-testid="signup-submit"
                    >
                      {loading ? "Creating account…" : (<>Create mentor account <ArrowRight className="ml-2 h-4 w-4" /></>)}
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

const IconField = ({ icon: Icon, label, children }) => (
  <div>
    <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block flex items-center gap-2">
      <Icon className="w-3 h-3" /> {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" strokeWidth={1.8} />
      {children}
    </div>
  </div>
);
