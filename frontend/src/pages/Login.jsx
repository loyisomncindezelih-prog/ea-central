import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowRight, Lock, Mail, ShieldCheck, AlertCircle, KeyRound } from "lucide-react";

export default function Login() {
  const { login, verify2FA } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 2FA challenge state — admin accounts with TOTP enabled get gated here
  // before the access cookies are issued.
  const [challenge, setChallenge] = useState(null); // { token, email }
  const [otp, setOtp] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login({ email, password });
      if (result && result.requires_2fa) {
        setChallenge({ token: result.challenge_token, email: result.user_hint?.email || email });
        toast.message("Enter the 6-digit code from your authenticator app.");
        return;
      }
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 402 && detail && typeof detail === "object" && detail.code === "payment_required") {
        toast.error(detail.message || "Complete payment to unlock your account");
        navigate(`/verify-account?email=${encodeURIComponent(detail.email || email)}`);
        return;
      }
      const msg = formatApiErrorDetail(detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    if (!challenge) return;
    setError("");
    setLoading(true);
    try {
      const user = await verify2FA({ challenge_token: challenge.token, code: otp.trim() });
      toast.success("Welcome back");
      navigate(user?.role === "admin" ? "/admin/dashboard" : "/dashboard");
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const cancelOtp = () => {
    setChallenge(null);
    setOtp("");
    setError("");
  };

  return (
    <div className="min-h-screen text-white ea-mobile ea-mesh-bg" data-testid="login-page">
      <Header />

      {/* Hero area */}
      <div className="relative overflow-hidden min-h-[calc(100vh-4rem)]">
        {/* Ambient halos */}
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-30" style={{ backgroundColor: "#1E90FF1F" }} />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-20" style={{ backgroundColor: "#1E90FF14" }} />
        {/* Soft dot grid */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-12 lg:py-20 items-center min-h-[calc(100vh-4rem)]">
          {/* Left brand panel */}
          <aside className="hidden lg:flex lg:col-span-5 flex-col gap-6">
            <div className="text-[10px] tracking-[0.32em] uppercase text-[#1E90FF] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E90FF] ea-pulse-dot" />
              / mentor portal
            </div>
            <h1 className="ea-mobile-display text-5xl xl:text-6xl text-white leading-[0.95]">
              Step back into
              <br />
              <span className="text-[#1E90FF]">your control room.</span>
            </h1>
            <p className="text-white/55 text-sm leading-relaxed max-w-md">
              Pick up where you left off. Your bot, your clients, your trading room — all one tap away.
            </p>

            <div className="mt-2 space-y-3">
              {[
                { icon: ShieldCheck, label: "Encrypted credentials", sub: "BCrypt 12 rounds · JWT auto-rotation" },
                { icon: Lock,        label: "Device-bound sessions", sub: "Lost laptop? Old token is dead instantly." },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-start gap-3 ea-card rounded-xl p-3.5 max-w-md">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#1E90FF1A", color: "#1E90FF" }}>
                    <Icon className="w-4 h-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{label}</div>
                    <div className="text-[11px] text-white/45 mt-0.5">{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Login card */}
          <div className="lg:col-span-7 flex justify-center">
            <div className="w-full max-w-md">
              <div className="ea-card-elevated rounded-3xl p-7 sm:p-9 ea-card-enter relative overflow-hidden">
                {/* Card accent corner */}
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-50" style={{ backgroundColor: "#1E90FF22" }} />

                <div className="relative">
                  <div className="text-[10px] tracking-[0.32em] uppercase text-[#1E90FF]">/ welcome back</div>
                  <h2 className="ea-mobile-display text-3xl sm:text-4xl text-white mt-2">
                    {challenge ? "Two-factor check." : "Mentor login."}
                  </h2>
                  <p className="text-white/55 text-sm mt-2">
                    {challenge ? (
                      <>Enter the 6-digit code from your authenticator app for <span className="text-white font-semibold">{challenge.email}</span>.</>
                    ) : (
                      <>New here?{" "}
                        <Link to="/signup" className="text-[#1E90FF] hover:underline font-semibold" data-testid="login-to-signup">
                          Create a mentor account
                        </Link>
                        .
                      </>
                    )}
                  </p>

                  {!challenge && (
                  <form onSubmit={submit} className="mt-7 space-y-4" data-testid="login-form">
                    <div>
                      <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" strokeWidth={1.8} />
                        <Input
                          required
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@domain.com"
                          className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 pl-11"
                          style={{ borderColor: "rgba(255,255,255,0.08)" }}
                          data-testid="login-email"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" strokeWidth={1.8} />
                        <Input
                          required
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 pl-11"
                          style={{ borderColor: "rgba(255,255,255,0.08)" }}
                          data-testid="login-password"
                        />
                      </div>
                    </div>

                    {error && (
                      <div
                        className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                        style={{ border: "1px solid rgba(239,68,68,0.30)", backgroundColor: "rgba(239,68,68,0.06)" }}
                        data-testid="login-error"
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
                      data-testid="login-submit"
                    >
                      {loading ? "Signing in…" : (<>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>)}
                    </Button>
                  </form>
                  )}

                  {challenge && (
                  <form onSubmit={submitOtp} className="mt-7 space-y-4" data-testid="login-2fa-form">
                    <div>
                      <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Authenticator code</label>
                      <div className="relative">
                        <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" strokeWidth={1.8} />
                        <Input
                          required
                          autoFocus
                          inputMode="numeric"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/[^0-9A-Z-]/gi, "").toUpperCase().slice(0, 11))}
                          placeholder="123456 or BACKUP-CODE"
                          className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 pl-11 tracking-[0.3em] text-center ea-mono"
                          style={{ borderColor: "rgba(255,255,255,0.08)" }}
                          data-testid="login-2fa-code"
                        />
                      </div>
                      <p className="text-[10px] tracking-[0.2em] uppercase text-white/35 mt-2">
                        Lost your phone? Use one of your 10 backup codes (XXXXX-XXXXX).
                      </p>
                    </div>

                    {error && (
                      <div
                        className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                        style={{ border: "1px solid rgba(239,68,68,0.30)", backgroundColor: "rgba(239,68,68,0.06)" }}
                        data-testid="login-2fa-error"
                      >
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#EF4444" }} />
                        <div className="text-xs text-white/85 leading-relaxed">{error}</div>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading || otp.length < 6}
                      className="w-full text-black font-bold rounded-xl h-12 tracking-wide ea-tap text-sm disabled:opacity-40"
                      style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 22px rgba(30,144,255,0.55)" }}
                      data-testid="login-2fa-submit"
                    >
                      {loading ? "Verifying…" : (<>Verify &amp; sign in <ArrowRight className="ml-2 h-4 w-4" /></>)}
                    </Button>
                    <button
                      type="button"
                      onClick={cancelOtp}
                      className="w-full text-[11px] tracking-[0.22em] uppercase text-white/45 hover:text-white/80 transition"
                      data-testid="login-2fa-cancel"
                    >
                      ← Back to password
                    </button>
                  </form>
                  )}

                  <div className="text-[10px] tracking-[0.28em] uppercase text-white/30 text-center mt-6 ea-mono">
                    ea-central · mentor portal
                  </div>
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
