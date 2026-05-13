import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Mail,
  KeyRound,
  Bell,
  Menu as MenuIcon,
  Home,
  Server,
  ArrowRight,
  Play,
  TrendingUp,
  Info,
  Power,
  X,
  LogOut,
  Wifi,
  Signal,
  BatteryFull,
} from "lucide-react";

const ROBOT_IMG =
  "https://customer-assets.emergentagent.com/job_copy-trading-hub-2/artifacts/ukmwnbqz_ChatGPT%20Image%20May%2013%2C%202026%2C%2009_34_45%20PM.png";

const LS_EMAIL = "ea_mobile_email";
const LS_LICENSE = "ea_mobile_license";

export default function MobileApp() {
  const navigate = useNavigate();
  const [stage, setStage] = useState("loading"); // loading | email | license | app
  const [email, setEmail] = useState(localStorage.getItem(LS_EMAIL) || "");
  const [license, setLicense] = useState(localStorage.getItem(LS_LICENSE) || "");
  const [busy, setBusy] = useState(false);
  const [eaData, setEaData] = useState(null);
  const [running, setRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-resume session on load
  const tryResume = useCallback(async () => {
    const savedEmail = localStorage.getItem(LS_EMAIL);
    const savedLicense = localStorage.getItem(LS_LICENSE);
    if (savedEmail && savedLicense) {
      try {
        const { data } = await api.post("/mobile/activate-license", {
          email: savedEmail,
          license_key: savedLicense,
        });
        setEaData(data);
        setStage("app");
        return;
      } catch (err) {
        const code = err.response?.status;
        if (code === 410) {
          toast.error("Your licence has expired");
          localStorage.removeItem(LS_LICENSE);
          setLicense("");
          setStage("license");
          return;
        }
        // fall through to email/license stage
      }
    }
    if (savedEmail) {
      try {
        await api.post("/mobile/check-email", { email: savedEmail });
        setStage("license");
        return;
      } catch {
        localStorage.removeItem(LS_EMAIL);
      }
    }
    setStage("email");
  }, []);

  useEffect(() => {
    tryResume();
  }, [tryResume]);

  // Auto-kick to license stage if expiry passes while in app
  useEffect(() => {
    if (!eaData?.expires_at) return;
    const ms = new Date(eaData.expires_at).getTime() - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => {
      toast.error("Your licence has just expired");
      handleExpire();
    }, Math.min(ms, 2147483000));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eaData]);

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/mobile/check-email", { email });
      localStorage.setItem(LS_EMAIL, email);
      toast.success("Email verified");
      setStage("license");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLicense = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/mobile/activate-license", {
        email,
        license_key: license,
      });
      localStorage.setItem(LS_LICENSE, license.trim().toUpperCase());
      setEaData(data);
      toast.success(`Welcome to ${data.ea_name}`);
      setStage("app");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExpire = () => {
    localStorage.removeItem(LS_LICENSE);
    setLicense("");
    setEaData(null);
    setRunning(false);
    setStage("license");
  };

  const fullLogout = () => {
    localStorage.removeItem(LS_LICENSE);
    localStorage.removeItem(LS_EMAIL);
    setLicense("");
    setEmail("");
    setEaData(null);
    setRunning(false);
    setMenuOpen(false);
    setStage("email");
  };

  // ============ RENDER ============

  if (stage === "loading") {
    return (
      <PhoneFrame>
        <div className="flex-1 flex items-center justify-center text-white/50 text-sm" data-testid="mobile-loading">
          Connecting…
        </div>
      </PhoneFrame>
    );
  }

  if (stage === "email") {
    return (
      <PhoneFrame>
        <AuthScreen
          icon={Mail}
          title="Enter your email"
          subtitle="Use the email tied to your ea-central account."
          testid="mobile-email-screen"
        >
          <form onSubmit={submitEmail} className="space-y-4" data-testid="mobile-email-form">
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-transparent border-[#1E90FF]/40 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12 text-center"
              data-testid="mobile-email-input"
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide"
              data-testid="mobile-email-submit"
            >
              {busy ? "Checking…" : (<>Continue <ArrowRight className="w-4 h-4 ml-2" /></>)}
            </Button>
          </form>
        </AuthScreen>
      </PhoneFrame>
    );
  }

  if (stage === "license") {
    return (
      <PhoneFrame>
        <AuthScreen
          icon={KeyRound}
          title="Enter licence key"
          subtitle={`Signed in as ${email}`}
          testid="mobile-license-screen"
        >
          <form onSubmit={submitLicense} className="space-y-4" data-testid="mobile-license-form">
            <Input
              required
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="EAC-XXXX-XXXX-XXXX-XXXX"
              className="bg-transparent border-[#1E90FF]/40 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12 text-center font-mono tracking-[0.15em] uppercase"
              data-testid="mobile-license-input"
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide"
              data-testid="mobile-license-submit"
            >
              {busy ? "Activating…" : (<>Activate <ArrowRight className="w-4 h-4 ml-2" /></>)}
            </Button>
            <button
              type="button"
              onClick={() => { localStorage.removeItem(LS_EMAIL); setEmail(""); setStage("email"); }}
              className="w-full text-xs tracking-[0.22em] uppercase text-white/45 hover:text-white pt-2"
              data-testid="mobile-license-change-email"
            >
              Use a different email
            </button>
          </form>
        </AuthScreen>
      </PhoneFrame>
    );
  }

  // ============ MAIN APP ============
  const eaName = eaData?.ea_name || "EA";
  const expiry = eaData?.expires_at ? new Date(eaData.expires_at) : null;
  const expiryLabel = expiry
    ? expiry.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "Lifetime";

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col overflow-y-auto bg-black relative" data-testid="mobile-app-screen">
        {/* Subtle blue grid backdrop */}
        <div className="absolute inset-0 ea-grid opacity-25 pointer-events-none" />

        {/* Top bar */}
        <div className="relative flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => setMenuOpen(true)} className="w-10 h-10 border border-[#1E90FF]/40 flex items-center justify-center text-[#1E90FF]" data-testid="mobile-menu-btn">
            <MenuIcon className="w-5 h-5" />
          </button>
          <h1 className="font-display text-base font-bold tracking-[0.2em] uppercase text-white truncate max-w-[55%] text-center" data-testid="mobile-app-title">
            {eaName}
          </h1>
          <button className="w-10 h-10 border border-[#1E90FF]/40 flex items-center justify-center text-[#1E90FF] relative" data-testid="mobile-bell-btn">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 bg-[#1E90FF] text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {running ? "1" : "0"}
            </span>
          </button>
        </div>

        {/* Robot in ring */}
        <div className="relative flex justify-center py-6">
          <div className="relative w-[230px] h-[230px] rounded-full border-2 border-[#1E90FF] shadow-[0_0_45px_rgba(30,144,255,0.55),inset_0_0_30px_rgba(30,144,255,0.25)] overflow-hidden">
            <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 28%", transform: "scale(2.1)" }} />
          </div>
        </div>

        {/* EA name plate */}
        <div className="relative mx-4 mt-1 border-2 border-[#1E90FF]/70 bg-[#001122]/40 rounded-lg p-4 text-center shadow-[0_0_24px_rgba(30,144,255,0.3)]" data-testid="mobile-ea-nameplate">
          <div className="font-display text-2xl font-bold text-[#1E90FF] tracking-tight break-words ea-glow">
            {eaName}
          </div>
          <div className="text-white/80 text-xs mt-1 tracking-wider">Fully automated EA</div>
        </div>

        {/* Action row */}
        <div className="relative mx-4 mt-4 border-2 border-[#1E90FF]/70 bg-[#001122]/40 rounded-lg grid grid-cols-3 divide-x divide-[#1E90FF]/30">
          <ActionBtn icon={TrendingUp} label="PAIRS" testid="mobile-action-pairs"
            onClick={() => toast.info(`${eaName} pairs synced from server`)} />
          <ActionBtn icon={Play} label={running ? "STOP" : "START"} testid="mobile-action-start"
            onClick={() => {
              setRunning((r) => !r);
              toast.success(running ? `${eaName} stopped` : `${eaName} is now trading`);
            }} highlight={running} />
          <ActionBtn icon={Info} label="INFO" testid="mobile-action-info"
            onClick={() => toast.info(`Mentor: ${eaData?.mentor_username || "—"} · Plan: ${eaData?.plan_label}`)} />
        </div>

        {/* Powered by */}
        <div className="relative mx-4 mt-3 border border-[#1E90FF]/40 bg-[#001122]/30 py-2 px-4 flex items-center justify-center gap-3 rounded-full">
          <span className="text-white text-xs tracking-[0.2em] uppercase">Powered by</span>
          <span className="font-display font-bold text-[#1E90FF] tracking-widest">LOYISO</span>
        </div>

        {/* Robot List */}
        <div className="relative mx-4 mt-5">
          <div className="text-white text-sm font-semibold mb-2 tracking-wide">Robot List</div>
          <div className="border-2 border-[#1E90FF]/70 rounded-lg p-3 flex items-center gap-3 bg-[#001122]/40" data-testid="mobile-robot-card">
            <div className="w-12 h-12 rounded-full border border-[#1E90FF] overflow-hidden shrink-0">
              <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 28%", transform: "scale(2.4)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate" data-testid="mobile-robot-name">{eaName}</div>
              <div className="text-[#1E90FF] text-xs">Adaptive AI Trading</div>
              <div className="text-white/55 text-[10px] tracking-wider mt-0.5" data-testid="mobile-robot-expiry">
                {expiry ? `Expires ${expiryLabel}` : "Lifetime licence"}
              </div>
            </div>
            <button onClick={handleExpire} className="w-8 h-8 rounded-full border border-[#1E90FF]/50 flex items-center justify-center text-[#1E90FF] hover:bg-[#1E90FF]/10" data-testid="mobile-robot-disconnect" title="Disconnect this EA">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1" />

        {/* Bottom nav */}
        <div className="relative mx-3 mb-3 mt-4 border-2 border-[#1E90FF]/70 bg-[#001122]/40 rounded-lg grid grid-cols-2 divide-x divide-[#1E90FF]/30">
          <NavBtn icon={Home} label="Home" active testid="mobile-nav-home" />
          <NavBtn icon={Server} label="Connect" testid="mobile-nav-connect"
            onClick={() => toast.success(running ? "Bridge connected" : "Start the EA first")} />
        </div>

        {/* Menu drawer */}
        {menuOpen && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex flex-col" data-testid="mobile-menu-drawer">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-display tracking-[0.22em] uppercase text-[#1E90FF] text-sm">Menu</h2>
              <button onClick={() => setMenuOpen(false)} className="w-10 h-10 border border-[#1E90FF]/40 flex items-center justify-center text-[#1E90FF]" data-testid="mobile-menu-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-6 flex flex-col gap-2">
              <DrawerInfo label="Account" value={email} />
              <DrawerInfo label="EA" value={eaName} />
              <DrawerInfo label="Licence" value={eaData?.key} mono />
              <DrawerInfo label="Plan" value={eaData?.plan_label} />
              <DrawerInfo label="Expires" value={expiryLabel} />
              <button onClick={() => navigate("/")} className="mt-6 border border-white/20 hover:border-[#1E90FF] text-white py-3 text-xs tracking-[0.22em] uppercase flex items-center justify-center gap-2" data-testid="mobile-menu-back-site">
                Back to ea-central.co
              </button>
              <button onClick={fullLogout} className="border border-[#1E90FF] bg-[#1E90FF]/10 text-[#1E90FF] py-3 text-xs tracking-[0.22em] uppercase flex items-center justify-center gap-2" data-testid="mobile-menu-logout">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}

// ============ small components ============

const PhoneFrame = ({ children }) => (
  <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 sm:p-8" data-testid="mobile-app-page">
    <div className="absolute -inset-10 bg-[#1E90FF]/10 blur-3xl pointer-events-none hidden md:block" />
    <div className="relative w-full max-w-[400px] aspect-[9/19] sm:aspect-[9/19.5] rounded-[44px] border border-white/15 bg-[#050505] p-2 sm:p-3 shadow-[0_0_60px_rgba(30,144,255,0.35)]">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-20" />
      <div className="w-full h-full rounded-[36px] bg-black overflow-hidden flex flex-col">
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-white/70 font-mono shrink-0">
          <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <div className="flex items-center gap-1.5">
            <Signal className="w-3 h-3" />
            <Wifi className="w-3 h-3" />
            <BatteryFull className="w-3.5 h-3.5 text-[#1E90FF]" />
          </div>
        </div>
        {children}
      </div>
    </div>
  </div>
);

const AuthScreen = ({ icon: Icon, title, subtitle, children, testid }) => (
  <div className="flex-1 flex flex-col items-center justify-center px-6 relative" data-testid={testid}>
    <div className="absolute inset-0 ea-grid opacity-25 pointer-events-none" />
    <div className="relative w-16 h-16 rounded-full border-2 border-[#1E90FF] flex items-center justify-center text-[#1E90FF] shadow-[0_0_30px_rgba(30,144,255,0.45)]">
      <Icon className="w-7 h-7" strokeWidth={1.5} />
    </div>
    <h2 className="relative font-display text-2xl font-bold tracking-tight mt-6 text-center">{title}</h2>
    <p className="relative text-white/55 text-xs text-center mt-2 max-w-xs">{subtitle}</p>
    <div className="relative w-full mt-7">{children}</div>
    <div className="relative mt-auto pb-2 pt-8 text-[10px] tracking-[0.25em] uppercase text-white/30 flex items-center gap-2">
      <Power className="w-3 h-3 text-[#1E90FF]" />
      ea-central · mobile EA
    </div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testid, highlight = false }) => (
  <button onClick={onClick} className={`py-4 flex flex-col items-center gap-1 transition ${highlight ? "bg-[#1E90FF]/15" : "hover:bg-[#1E90FF]/10"}`} data-testid={testid}>
    <Icon className="w-5 h-5 text-[#1E90FF]" strokeWidth={1.6} />
    <span className="text-white text-xs tracking-[0.2em] font-bold">{label}</span>
  </button>
);

const NavBtn = ({ icon: Icon, label, active = false, onClick, testid }) => (
  <button onClick={onClick} className={`py-3 flex flex-col items-center gap-1 ${active ? "bg-[#1E90FF]/10" : "hover:bg-white/5"}`} data-testid={testid}>
    <Icon className={`w-5 h-5 ${active ? "text-[#1E90FF]" : "text-white/70"}`} strokeWidth={1.6} />
    <span className={`text-[11px] tracking-wider ${active ? "text-[#1E90FF]" : "text-white/70"}`}>{label}</span>
  </button>
);

const DrawerInfo = ({ label, value, mono = false }) => (
  <div className="border border-white/10 px-3 py-2.5">
    <div className="text-[9px] tracking-[0.25em] uppercase text-white/40">{label}</div>
    <div className={`text-sm text-white truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
  </div>
);
