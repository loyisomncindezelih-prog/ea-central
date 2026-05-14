import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CountryCodeSelect } from "@/components/CountryCodeSelect";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

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
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!agree) {
      setError("Please accept the Terms & Conditions to continue.");
      return;
    }
    setLoading(true);
    try {
      const res = await register(form);
      toast.success("Account created — complete the R439 payment to unlock your dashboard");
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
    <div className="min-h-screen bg-black text-white" data-testid="signup-page">
      <Header />
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-4rem)]">
        {/* Left brand panel */}
        <div className="hidden lg:flex lg:col-span-5 relative overflow-hidden border-r border-white/10">
          <div className="absolute inset-0 ea-grid opacity-60" />
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-[#1E90FF]/20 blur-3xl" />
          <div className="absolute -bottom-32 right-0 w-[420px] h-[420px] rounded-full bg-[#1E90FF]/10 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between p-12 w-full">
            <Logo size={44} />
            <div>
              <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ mentor onboarding</div>
              <h2 className="font-display text-4xl font-black tracking-tight mt-4 leading-tight">
                Run a copy trading room
                <br />
                <span className="text-[#1E90FF]">from your terminal.</span>
              </h2>
              <p className="mt-6 text-white/60 text-sm max-w-sm leading-relaxed">
                Sign up once, pair your PC bot, and start onboarding clients to your private mobile EA.
              </p>
            </div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/30">
              ea-central · mentor portal
            </div>
          </div>
        </div>

        {/* Right form */}
        <div className="lg:col-span-7 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-xl">
            <div className="text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ create account</div>
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight mt-3">
              Become a mentor.
            </h1>
            <p className="text-white/60 text-sm mt-2">
              Already have an account?{" "}
              <Link to="/login" className="text-[#1E90FF] hover:underline" data-testid="signup-to-login">
                Login here
              </Link>
              .
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5" data-testid="signup-form">
              <Field label="Username">
                <Input
                  required
                  minLength={2}
                  value={form.username}
                  onChange={onChange("username")}
                  placeholder="trader.alpha"
                  className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                  data-testid="signup-username"
                />
              </Field>

              <Field label="Email">
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={onChange("email")}
                  placeholder="you@domain.com"
                  className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                  data-testid="signup-email"
                />
              </Field>

              <Field label="Contact number">
                <div className="flex gap-3">
                  <CountryCodeSelect
                    value={form.country_code}
                    onChange={(v) => setForm((f) => ({ ...f, country_code: v }))}
                    testId="signup-country-code"
                  />
                  <Input
                    required
                    inputMode="tel"
                    value={form.contact_number}
                    onChange={onChange("contact_number")}
                    placeholder="555 123 4567"
                    className="flex-1 bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                    data-testid="signup-contact"
                  />
                </div>
              </Field>

              <Field label="Password">
                <Input
                  required
                  minLength={6}
                  type="password"
                  value={form.password}
                  onChange={onChange("password")}
                  placeholder="At least 6 characters"
                  className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
                  data-testid="signup-password"
                />
              </Field>

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
                  <span className="text-[#1E90FF] underline underline-offset-4">Terms and Conditions</span>{" "}
                  and acknowledge the risks involved in algorithmic trading.
                </label>
              </div>

              {error && (
                <div
                  className="border border-white/20 bg-white/5 text-white/80 text-sm px-4 py-3"
                  data-testid="signup-error"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide disabled:opacity-50"
                data-testid="signup-submit"
              >
                {loading ? "Creating account…" : (
                  <>
                    Create mentor account <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">{label}</Label>
    {children}
  </div>
);
