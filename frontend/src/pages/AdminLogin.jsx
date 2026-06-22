import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, KeyRound } from "lucide-react";

export default function AdminLogin() {
  const { login, verify2FA, logout, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null); // { token, email }
  const [otp, setOtp] = useState("");

  // If already logged in as admin, hop straight to the dashboard.
  useEffect(() => {
    if (user && user !== false && user.role === "admin") {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login({ email, password });
      if (u && u.requires_2fa) {
        setChallenge({ token: u.challenge_token, email: u.user_hint?.email || email });
        toast.message("Enter the 6-digit code from your authenticator app.");
        return;
      }
      if (u?.role !== "admin") {
        await logout();
        const msg = "This account is not an administrator.";
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Admin signed in");
      navigate("/admin/dashboard");
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
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
      const u = await verify2FA({ challenge_token: challenge.token, code: otp.trim() });
      if (u?.role !== "admin") {
        await logout();
        const msg = "This account is not an administrator.";
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Admin signed in");
      navigate("/admin/dashboard");
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white" data-testid="admin-login-page">
      <Header />
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-4rem)]">
        <div className="hidden lg:flex lg:col-span-5 relative overflow-hidden border-r border-white/10">
          <div className="absolute inset-0 ea-grid opacity-60" />
          <div className="absolute top-1/3 -left-24 w-[420px] h-[420px] rounded-full bg-[#1E90FF]/20 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between p-12 w-full">
            <Logo size={44} />
            <div>
              <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ admin portal</div>
              <h2 className="font-display text-4xl font-bold tracking-tight mt-4 leading-tight">
                Review mentors.
                <br />
                <span className="text-[#1E90FF]">Approve or reject.</span>
              </h2>
              <p className="mt-6 text-white/60 text-sm max-w-sm leading-relaxed">
                Manage every account joining ea-central. Verify mentors before they go live.
              </p>
            </div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/30">
              ea-central · admin only
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#1E90FF]">
              <ShieldCheck className="w-4 h-4" />
              / admin
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-3">
              {challenge ? "Two-factor check." : "Admin login."}
            </h1>
            <p className="text-white/60 text-sm mt-2">
              {challenge
                ? <>Enter the 6-digit code from your authenticator app for <span className="text-white font-semibold">{challenge.email}</span>.</>
                : "Restricted area. Only ea-central administrators can sign in here."}
            </p>

            {!challenge && (
            <form onSubmit={submit} className="mt-8 space-y-5" data-testid="admin-login-form">
              <div>
                <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">Admin email</Label>
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ea-central.com"
                  className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                  data-testid="admin-login-email"
                />
              </div>
              <div>
                <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">Password</Label>
                <Input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                  data-testid="admin-login-password"
                />
              </div>

              {error && (
                <div
                  className="border border-white/20 bg-white/5 text-white/80 text-sm px-4 py-3"
                  data-testid="admin-login-error"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide disabled:opacity-50"
                data-testid="admin-login-submit"
              >
                {loading ? "Signing in…" : (
                  <>
                    Sign in as admin <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
            )}

            {challenge && (
            <form onSubmit={submitOtp} className="mt-8 space-y-5" data-testid="admin-login-2fa-form">
              <div>
                <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">Authenticator code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" strokeWidth={1.8} />
                  <Input
                    required
                    autoFocus
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9A-Z-]/gi, "").toUpperCase().slice(0, 11))}
                    placeholder="123456 or BACKUP-CODE"
                    className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12 pl-11 tracking-[0.3em] text-center font-mono"
                    data-testid="admin-login-2fa-code"
                  />
                </div>
                <p className="text-[10px] tracking-[0.2em] uppercase text-white/35 mt-2">
                  Lost your phone? Use one of your backup codes.
                </p>
              </div>

              {error && (
                <div className="border border-white/20 bg-white/5 text-white/80 text-sm px-4 py-3" data-testid="admin-login-2fa-error">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide disabled:opacity-50"
                data-testid="admin-login-2fa-submit"
              >
                {loading ? "Verifying…" : (<>Verify &amp; sign in <ArrowRight className="ml-2 h-4 w-4" /></>)}
              </Button>
              <button
                type="button"
                onClick={() => { setChallenge(null); setOtp(""); setError(""); }}
                className="w-full text-[11px] tracking-[0.22em] uppercase text-white/45 hover:text-white/80 transition"
                data-testid="admin-login-2fa-cancel"
              >
                ← Back to password
              </button>
            </form>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
