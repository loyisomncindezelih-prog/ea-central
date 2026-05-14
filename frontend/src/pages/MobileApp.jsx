import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Settings as SettingsIcon,
  Palette,
} from "lucide-react";

const ROBOT_IMG =
  "https://customer-assets.emergentagent.com/job_copy-trading-hub-2/artifacts/ukmwnbqz_ChatGPT%20Image%20May%2013%2C%202026%2C%2009_34_45%20PM.png";

// Home-screen / PWA icon (separate from the robot image used inside the app)
const APP_ICON =
  "https://customer-assets.emergentagent.com/job_copy-trading-hub-2/artifacts/wyquoaye_ChatGPT%20Image%20May%2012%2C%202026%2C%2009_13_48%20PM.png";

const LS_EMAIL = "ea_mobile_email";
const LS_LICENSE = "ea_mobile_license";
const LS_THEME = "ea_mobile_theme";
const LS_BROKER = "ea_mobile_broker";

const PLATFORMS = [
  { key: "mt4", label: "MetaTrader 4" },
  { key: "mt5", label: "MetaTrader 5" },
];

const THEMES = {
  blue:  { name: "Blue",  hex: "#1E90FF", soft: "rgba(30,144,255,0.10)", glow: "rgba(30,144,255,0.55)", border: "rgba(30,144,255,0.70)" },
  red:   { name: "Red",   hex: "#FF3B3B", soft: "rgba(255,59,59,0.10)",  glow: "rgba(255,59,59,0.55)",  border: "rgba(255,59,59,0.70)" },
  green: { name: "Green", hex: "#22C55E", soft: "rgba(34,197,94,0.10)",  glow: "rgba(34,197,94,0.55)",  border: "rgba(34,197,94,0.70)" },
};

export default function MobileApp() {
  const navigate = useNavigate();
  const [stage, setStage] = useState("loading"); // loading | email | license | app
  const [email, setEmail] = useState(localStorage.getItem(LS_EMAIL) || "");
  const [license, setLicense] = useState(localStorage.getItem(LS_LICENSE) || "");
  const [busy, setBusy] = useState(false);
  const [eaData, setEaData] = useState(null);
  const [running, setRunning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [themeKey, setThemeKey] = useState(localStorage.getItem(LS_THEME) || "blue");
  const theme = THEMES[themeKey] || THEMES.blue;
  const accent = theme.hex;

  // Broker (MetaTrader) credentials — saved locally on this device only.
  // A future "ea-central bridge" running on the user's PC/VPS will read these
  // to authenticate against MT4/MT5 on their behalf. The web app never trades directly.
  const [broker, setBroker] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_BROKER);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed || { platform: "mt4", server: "", account: "", password: "" };
    } catch {
      return { platform: "mt4", server: "", account: "", password: "" };
    }
  });
  const [brokerBusy, setBrokerBusy] = useState(false);

  // PWA: install hints for iOS "Add to Home Screen" + standalone full-screen
  useEffect(() => {
    const tags = [
      ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
      ["meta", { name: "mobile-web-app-capable", content: "yes" }],
      ["meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }],
      ["meta", { name: "apple-mobile-web-app-title", content: "ea-central" }],
      ["meta", { name: "application-name", content: "ea-central" }],
      ["meta", { name: "theme-color", content: "#000000" }],
      ["link", { rel: "apple-touch-icon", href: APP_ICON }],
      ["link", { rel: "apple-touch-icon", sizes: "180x180", href: APP_ICON }],
      ["link", { rel: "apple-touch-icon", sizes: "152x152", href: APP_ICON }],
      ["link", { rel: "apple-touch-icon", sizes: "120x120", href: APP_ICON }],
      ["link", { rel: "icon", type: "image/png", sizes: "512x512", href: APP_ICON }],
      ["link", { rel: "icon", type: "image/png", sizes: "192x192", href: APP_ICON }],
      ["link", { rel: "shortcut icon", href: APP_ICON }],
      ["link", { rel: "manifest", href: "/manifest.webmanifest", crossOrigin: "use-credentials" }],
    ];
    const created = tags.map(([t, attrs]) => {
      const el = document.createElement(t);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      return el;
    });
    const prevViewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content");
    document.querySelector('meta[name="viewport"]')?.setAttribute(
      "content",
      "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
    );
    return () => {
      created.forEach((el) => el.remove());
      if (prevViewport) document.querySelector('meta[name="viewport"]')?.setAttribute("content", prevViewport);
    };
  }, []);

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)").matches ||
           window.navigator.standalone === true;
  }, []);

  const setTheme = (k) => {
    setThemeKey(k);
    localStorage.setItem(LS_THEME, k);
  };

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

  // Poll for broker approval / EA session updates while on the app stage.
  // Stops when broker is approved AND no ea_session is pending (i.e. terminal state).
  useEffect(() => {
    if (stage !== "app" || !email || !license) return;
    const brokerStatus = eaData?.broker?.status;
    const needsPolling = !brokerStatus
      ? false
      : ["pending_approval", "declined"].includes(brokerStatus);
    if (!needsPolling) return;
    const iv = setInterval(async () => {
      try {
        const { data } = await api.post("/mobile/activate-license", { email, license_key: license });
        const oldStatus = eaData?.broker?.status;
        const newStatus = data?.broker?.status;
        if (oldStatus === "pending_approval" && newStatus === "approved") {
          toast.success("Broker successfully linked");
        }
        if (oldStatus === "pending_approval" && newStatus === "declined") {
          toast.error(data?.broker?.decision_reason || "Invalid credentials or server");
        }
        setEaData(data);
      } catch { /* swallow polling errors */ }
    }, 4000);
    return () => clearInterval(iv);
  }, [stage, email, license, eaData?.broker?.status]);

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
      <PhoneFrame standalone={isStandalone} accent={accent}>
        <div className="flex-1 flex items-center justify-center text-white/50 text-sm" data-testid="mobile-loading">
          Connecting…
        </div>
      </PhoneFrame>
    );
  }

  if (stage === "email") {
    return (
      <PhoneFrame standalone={isStandalone} accent={accent}>
        <AuthScreen
          icon={Mail}
          title="Enter your email"
          subtitle="Use the email tied to your ea-central account."
          testid="mobile-email-screen"
          accent={accent}
        >
          <form onSubmit={submitEmail} className="space-y-4" data-testid="mobile-email-form">
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12 text-center"
              style={{ borderColor: `${accent}66` }}
              data-testid="mobile-email-input"
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full text-black font-bold rounded-none h-12 tracking-wide"
              style={{ backgroundColor: accent }}
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
      <PhoneFrame standalone={isStandalone} accent={accent}>
        <AuthScreen
          icon={KeyRound}
          title="Enter licence key"
          subtitle={`Signed in as ${email}`}
          testid="mobile-license-screen"
          accent={accent}
        >
          <form onSubmit={submitLicense} className="space-y-4" data-testid="mobile-license-form">
            <Input
              required
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="EAC-XXXX-XXXX-XXXX-XXXX"
              className="bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12 text-center font-mono tracking-[0.15em] uppercase"
              style={{ borderColor: `${accent}66` }}
              data-testid="mobile-license-input"
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full text-black font-bold rounded-none h-12 tracking-wide"
              style={{ backgroundColor: accent }}
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
    <PhoneFrame standalone={isStandalone} accent={accent}>
      <div className="flex-1 flex flex-col overflow-y-auto bg-black relative" data-testid="mobile-app-screen">
        {/* Subtle blue grid backdrop */}
        <div className="absolute inset-0 ea-grid opacity-25 pointer-events-none" />

        {/* Top bar */}
        <div className="relative flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => setMenuOpen(true)} className="w-10 h-10 flex items-center justify-center" style={{ borderColor: `${accent}66`, borderWidth: 1, color: accent }} data-testid="mobile-menu-btn">
            <MenuIcon className="w-5 h-5" />
          </button>
          <h1 className="font-display text-base font-bold tracking-[0.2em] uppercase text-white truncate max-w-[55%] text-center" data-testid="mobile-app-title">
            {eaName}
          </h1>
          <button className="w-10 h-10 flex items-center justify-center relative" style={{ borderColor: `${accent}66`, borderWidth: 1, color: accent }} data-testid="mobile-bell-btn">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: accent }}>
              {running ? "1" : "0"}
            </span>
          </button>
        </div>

        {/* Robot in ring */}
        <div className="relative flex justify-center py-6">
          <div className="relative w-[230px] h-[230px] rounded-full overflow-hidden"
            style={{
              border: `2px solid ${accent}`,
              boxShadow: `0 0 45px ${theme.glow}, inset 0 0 30px ${theme.soft}`,
            }}>
            {eaData?.mentor_profile_image ? (
              <img src={eaData.mentor_profile_image} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 50%" }} data-testid="mobile-ea-avatar" />
            ) : (
              <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 32%", transform: "scale(1.6)", transformOrigin: "50% 32%" }} data-testid="mobile-ea-avatar-default" />
            )}
          </div>
        </div>

        {/* EA name plate */}
        <div className="relative mx-4 mt-1 rounded-lg p-4 text-center"
          style={{ border: `2px solid ${theme.border}`, backgroundColor: "rgba(0,17,34,0.4)", boxShadow: `0 0 24px ${theme.soft}` }}
          data-testid="mobile-ea-nameplate">
          <div className="font-display text-2xl font-bold tracking-tight break-words" style={{ color: accent, textShadow: `0 0 18px ${theme.glow}` }}>
            {eaName}
          </div>
          <div className="text-white/80 text-xs mt-1 tracking-wider">Fully automated EA</div>
        </div>

        {/* Animated candlestick chart */}
        <div className="relative mx-4 mt-3 rounded-lg overflow-hidden"
          style={{ border: `2px solid ${theme.border}`, backgroundColor: "rgba(0,17,34,0.4)" }}
          data-testid="mobile-live-chart">
          <CandleChart accent={accent} soft={theme.soft} running={running} />
        </div>

        {/* Action row */}
        <div className="relative mx-4 mt-4 rounded-lg grid grid-cols-3"
          style={{ border: `2px solid ${theme.border}`, backgroundColor: "rgba(0,17,34,0.4)" }}>
          <ActionBtn icon={TrendingUp} label="PAIRS" accent={accent} testid="mobile-action-pairs"
            onClick={() => setPairsOpen(true)} />
          <ActionBtn icon={Play} label={running ? "STOP" : "START"} accent={accent} testid="mobile-action-start"
            onClick={async () => {
              if (running) {
                try {
                  await api.post("/mobile/ea/stop", { email, license_key: license });
                } catch { /* ignore */ }
                setRunning(false);
                setStartOpen(false);
                toast.success(`${eaName} stopped`);
                return;
              }
              try {
                const { data } = await api.post("/mobile/ea/start", { email, license_key: license });
                setRunning(true);
                setStartOpen(true);
                setEaData((d) => ({ ...(d || {}), ea_session: { status: "running", started_at: data.started_at } }));
              } catch (err) {
                toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
              }
            }} highlight={running} themeSoft={theme.soft} />
          <ActionBtn icon={Info} label="INFO" accent={accent} testid="mobile-action-info"
            onClick={() => toast.info(`Mentor: ${eaData?.mentor_username || "—"} · Plan: ${eaData?.plan_label}`)} />
        </div>

        {/* Powered by */}
        <div className="relative mx-4 mt-3 py-2 px-4 flex items-center justify-center gap-3 rounded-full"
          style={{ border: `1px solid ${accent}66`, backgroundColor: "rgba(0,17,34,0.3)" }}>
          <span className="text-white text-xs tracking-[0.2em] uppercase">Powered by</span>
          <span className="font-display font-bold tracking-widest" style={{ color: accent }}>LOYISO</span>
        </div>

        {/* Robot List */}
        <div className="relative mx-4 mt-5">
          <div className="text-white text-sm font-semibold mb-2 tracking-wide">Robot List</div>
          <div className="rounded-lg p-3 flex items-center gap-3"
            style={{ border: `2px solid ${theme.border}`, backgroundColor: "rgba(0,17,34,0.4)" }}
            data-testid="mobile-robot-card">
            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ border: `1px solid ${accent}` }}>
              {eaData?.mentor_profile_image ? (
                <img src={eaData.mentor_profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 32%", transform: "scale(1.7)", transformOrigin: "50% 32%" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate" data-testid="mobile-robot-name">{eaName}</div>
              <div className="text-xs" style={{ color: accent }}>Adaptive AI Trading</div>
              <div className="text-white/55 text-[10px] tracking-wider mt-0.5" data-testid="mobile-robot-expiry">
                {expiry ? `Expires ${expiryLabel}` : "Lifetime licence"}
              </div>
            </div>
            <button onClick={handleExpire} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5" style={{ border: `1px solid ${accent}80`, color: accent }} data-testid="mobile-robot-disconnect" title="Disconnect this EA">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Broker status */}
        <div className="relative mx-4 mt-3">
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="w-full rounded-lg p-3 flex items-center gap-3 text-left"
            style={{ border: `2px solid ${eaData?.broker ? theme.border : "rgba(255,255,255,0.1)"}`, backgroundColor: "rgba(0,17,34,0.4)" }}
            data-testid="mobile-broker-status"
          >
            <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ border: `1px solid ${accent}`, color: accent }}>
              <Server className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Broker bridge</div>
              {eaData?.broker ? (
                <div className="text-sm text-white truncate" data-testid="mobile-broker-summary">
                  {eaData.broker.platform?.toUpperCase()} · {eaData.broker.server} · #{eaData.broker.account}
                </div>
              ) : (
                <div className="text-sm text-white/55">Not configured — tap to link MT4 / MT5</div>
              )}
            </div>
            {(() => {
              const s = eaData?.broker?.status;
              const label =
                !eaData?.broker ? "setup" :
                s === "pending_approval" ? "linking…" :
                s === "approved" ? "approved" :
                s === "declined" ? "declined" : "configured";
              const color =
                !eaData?.broker ? "rgba(255,255,255,0.4)" :
                s === "declined" ? "#FF3B3B" :
                s === "pending_approval" ? "rgba(255,200,80,0.95)" :
                accent;
              return (
                <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1"
                  style={{ color, border: `1px solid ${color === "rgba(255,255,255,0.4)" ? "rgba(255,255,255,0.15)" : color}` }}
                  data-testid="mobile-broker-status-badge">
                  {label}
                </div>
              );
            })()}
          </button>
        </div>

        <div className="flex-1" />

        {/* Bottom nav */}
        <div className="relative mx-3 mb-3 mt-4 rounded-lg grid grid-cols-3"
          style={{ border: `2px solid ${theme.border}`, backgroundColor: "rgba(0,17,34,0.4)" }}>
          <NavBtn icon={Home} label="Home" active accent={accent} themeSoft={theme.soft} testid="mobile-nav-home" />
          <NavBtn icon={Server} label="Connect" accent={accent} testid="mobile-nav-connect"
            onClick={() => setConnectOpen(true)} />
          <NavBtn icon={SettingsIcon} label="Settings" accent={accent} testid="mobile-nav-settings"
            onClick={() => setSettingsOpen(true)} />
        </div>

        {/* Menu drawer */}
        {menuOpen && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex flex-col" data-testid="mobile-menu-drawer">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-display tracking-[0.22em] uppercase text-sm" style={{ color: accent }}>Menu</h2>
              <button onClick={() => setMenuOpen(false)} className="w-10 h-10 flex items-center justify-center" style={{ border: `1px solid ${accent}66`, color: accent }} data-testid="mobile-menu-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-6 flex flex-col gap-2">
              <DrawerInfo label="Account" value={email} />
              <DrawerInfo label="EA" value={eaName} />
              <DrawerInfo label="Licence" value={eaData?.key} mono />
              <DrawerInfo label="Plan" value={eaData?.plan_label} />
              <DrawerInfo label="Expires" value={expiryLabel} />
              <button onClick={() => { setMenuOpen(false); setSettingsOpen(true); }} className="mt-2 border border-white/20 hover:border-white/40 text-white py-3 text-xs tracking-[0.22em] uppercase flex items-center justify-center gap-2" data-testid="mobile-menu-settings">
                <SettingsIcon className="w-4 h-4" /> Settings
              </button>
              <button onClick={() => navigate("/")} className="mt-1 border border-white/20 hover:border-white/40 text-white py-3 text-xs tracking-[0.22em] uppercase flex items-center justify-center gap-2" data-testid="mobile-menu-back-site">
                Back to ea-central.co
              </button>
              <button onClick={fullLogout} className="py-3 text-xs tracking-[0.22em] uppercase flex items-center justify-center gap-2" style={{ border: `1px solid ${accent}`, color: accent, backgroundColor: theme.soft }} data-testid="mobile-menu-logout">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        )}

        {/* Settings drawer */}
        {settingsOpen && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-sm flex flex-col" data-testid="mobile-settings-drawer">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-display tracking-[0.22em] uppercase text-sm flex items-center gap-2" style={{ color: accent }}>
                <SettingsIcon className="w-4 h-4" /> Settings
              </h2>
              <button onClick={() => setSettingsOpen(false)} className="w-10 h-10 flex items-center justify-center" style={{ border: `1px solid ${accent}66`, color: accent }} data-testid="mobile-settings-close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-6 flex flex-col gap-5">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45 mb-3 flex items-center gap-2">
                  <Palette className="w-3 h-3" /> Theme
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(THEMES).map(([k, t]) => (
                    <button
                      key={k}
                      onClick={() => { setTheme(k); toast.success(`Theme: ${t.name}`); }}
                      className="py-4 flex flex-col items-center gap-2 transition"
                      style={{
                        border: `2px solid ${themeKey === k ? t.hex : "rgba(255,255,255,0.1)"}`,
                        backgroundColor: themeKey === k ? `${t.hex}1A` : "transparent",
                      }}
                      data-testid={`mobile-theme-${k}`}
                    >
                      <span className="w-8 h-8 rounded-full" style={{ backgroundColor: t.hex, boxShadow: `0 0 20px ${t.hex}80` }} />
                      <span className="text-[10px] tracking-[0.2em] uppercase text-white">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/5 pt-5">
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/45 mb-3">Session</div>
                <button onClick={fullLogout} className="w-full py-3 text-xs tracking-[0.22em] uppercase flex items-center justify-center gap-2" style={{ border: `1px solid ${accent}`, color: accent, backgroundColor: theme.soft }} data-testid="mobile-settings-logout">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>

              {!isStandalone && (
                <div className="border border-white/10 p-4 text-center mt-1">
                  <div className="text-[10px] tracking-[0.25em] uppercase text-white/45 mb-1">📱 Tip</div>
                  <div className="text-xs text-white/70 leading-relaxed">
                    On iPhone: tap <span className="text-white font-semibold">Share → "Add to Home Screen"</span> to install ea-central as a full-screen app.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connect (broker) drawer */}
        {connectOpen && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-sm flex flex-col overflow-y-auto" data-testid="mobile-connect-drawer">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-display tracking-[0.22em] uppercase text-sm flex items-center gap-2" style={{ color: accent }}>
                <Server className="w-4 h-4" /> Broker connection
              </h2>
              <button onClick={() => setConnectOpen(false)} className="w-10 h-10 flex items-center justify-center" style={{ border: `1px solid ${accent}66`, color: accent }} data-testid="mobile-connect-close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBrokerBusy(true);
                try {
                  const { data } = await api.post("/mobile/connect-broker", {
                    email,
                    license_key: license,
                    platform: broker.platform,
                    server: broker.server,
                    account: broker.account,
                    password: broker.password,
                  });
                  localStorage.setItem(LS_BROKER, JSON.stringify({
                    platform: data.platform, server: data.server, account: data.account, password: "",
                  }));
                  setEaData((d) => ({ ...(d || {}), broker: { platform: data.platform, server: data.server, account: data.account, connected_at: data.connected_at, status: data.status || "pending_approval" } }));
                  toast.info(`${data.platform.toUpperCase()} broker linking to server… awaiting admin verification`);
                  setConnectOpen(false);
                } catch (err) {
                  toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
                } finally {
                  setBrokerBusy(false);
                }
              }}
              className="px-5 py-4 flex flex-col gap-4"
              data-testid="mobile-broker-form"
            >
              {/* Platform selector */}
              <div>
                <label className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5 block">Trading platform</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setBroker({ ...broker, platform: p.key })}
                      className="py-3 text-xs tracking-[0.22em] uppercase transition"
                      style={{
                        border: `2px solid ${broker.platform === p.key ? accent : "rgba(255,255,255,0.12)"}`,
                        color: broker.platform === p.key ? accent : "rgba(255,255,255,0.7)",
                        backgroundColor: broker.platform === p.key ? theme.soft : "transparent",
                      }}
                      data-testid={`broker-platform-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <BrokerField label="Broker server" value={broker.server} onChange={(v) => setBroker({ ...broker, server: v })} placeholder="e.g. ICMarketsSC-Demo02" accent={accent} testid="broker-server" />
              <BrokerField label="Account / Login" value={broker.account} onChange={(v) => setBroker({ ...broker, account: v })} placeholder="123456789" accent={accent} testid="broker-account" />
              <BrokerField label="Password (investor / main)" type="password" value={broker.password} onChange={(v) => setBroker({ ...broker, password: v })} placeholder="••••••••" accent={accent} testid="broker-password" />

              <div className="border p-3 text-[11px] text-white/65 leading-relaxed" style={{ borderColor: `${accent}40`, backgroundColor: theme.soft }}>
                <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: accent }}>Coming soon</div>
                Credentials are stored encrypted on the ea-central server and will be picked up by the
                ea-central bridge (a small desktop helper running on your PC/VPS) for automatic
                MT4/MT5 trade execution. The bridge installer ships in the next release.
              </div>

              <Button type="submit" disabled={brokerBusy} className="w-full text-black font-bold rounded-none h-12 tracking-wide" style={{ backgroundColor: accent }} data-testid="broker-save">
                {brokerBusy ? "Linking…" : "Link broker"}
              </Button>
              {(broker.server || broker.account || eaData?.broker) && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.post("/mobile/disconnect-broker", { email, license_key: license });
                    } catch { /* ignore */ }
                    setBroker({ platform: "mt4", server: "", account: "", password: "" });
                    localStorage.removeItem(LS_BROKER);
                    setEaData((d) => ({ ...(d || {}), broker: null }));
                    toast.success("Broker unlinked");
                  }}
                  className="text-xs tracking-[0.22em] uppercase text-white/45 hover:text-white py-2"
                  data-testid="broker-unlink"
                >
                  Unlink broker
                </button>
              )}
            </form>
          </div>
        )}

        {/* Pairs drawer */}
        {pairsOpen && (
          <PairsDrawer
            email={email}
            license={license}
            allowedSymbols={eaData?.allowed_symbols || []}
            pairConfigs={eaData?.pair_configs || []}
            setEaData={setEaData}
            theme={theme}
            accent={accent}
            onClose={() => setPairsOpen(false)}
          />
        )}

        {/* Start popup (server connected · waiting for opportunities) */}
        {startOpen && (
          <StartPopup
            eaName={eaName}
            broker={eaData?.broker}
            pairs={eaData?.pair_configs || []}
            accent={accent}
            theme={theme}
            onClose={() => setStartOpen(false)}
          />
        )}
      </div>
    </PhoneFrame>
  );
}

// ============ small components ============

const BrokerField = ({ label, value, onChange, placeholder, type = "text", accent, testid }) => (
  <div>
    <label className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5 block">{label}</label>
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-11"
      style={{ borderColor: `${accent}55` }}
      data-testid={testid}
    />
  </div>
);

const PhoneFrame = ({ children, standalone = false, accent = "#1E90FF" }) => {
  if (standalone) {
    // Installed as PWA / Add-to-Home — go full screen, no phone bezel
    return (
      <div className="min-h-screen bg-black text-white flex flex-col" data-testid="mobile-app-page" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {children}
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 sm:p-8" data-testid="mobile-app-page">
      <div className="absolute -inset-10 blur-3xl pointer-events-none hidden md:block" style={{ backgroundColor: `${accent}1A` }} />
      <div className="relative w-full max-w-[400px] aspect-[9/19] sm:aspect-[9/19.5] rounded-[44px] border border-white/15 bg-[#050505] p-2 sm:p-3" style={{ boxShadow: `0 0 60px ${accent}59` }}>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-20" />
        <div className="w-full h-full rounded-[36px] bg-black overflow-hidden flex flex-col">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-white/70 font-mono shrink-0">
            <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            <div className="flex items-center gap-1.5">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <BatteryFull className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

const AuthScreen = ({ icon: Icon, title, subtitle, children, testid, accent = "#1E90FF" }) => (
  <div className="flex-1 flex flex-col items-center justify-center px-6 relative" data-testid={testid}>
    <div className="absolute inset-0 ea-grid opacity-25 pointer-events-none" />
    <div className="relative w-16 h-16 rounded-full flex items-center justify-center" style={{ border: `2px solid ${accent}`, color: accent, boxShadow: `0 0 30px ${accent}73` }}>
      <Icon className="w-7 h-7" strokeWidth={1.5} />
    </div>
    <h2 className="relative font-display text-2xl font-bold tracking-tight mt-6 text-center">{title}</h2>
    <p className="relative text-white/55 text-xs text-center mt-2 max-w-xs">{subtitle}</p>
    <div className="relative w-full mt-7">{children}</div>
    <div className="relative mt-auto pb-2 pt-8 text-[10px] tracking-[0.25em] uppercase text-white/30 flex items-center gap-2">
      <Power className="w-3 h-3" style={{ color: accent }} />
      ea-central · mobile EA
    </div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testid, highlight = false, accent = "#1E90FF", themeSoft }) => (
  <button onClick={onClick} className="py-4 flex flex-col items-center gap-1 transition border-r last:border-r-0" style={{ borderColor: `${accent}33`, backgroundColor: highlight ? (themeSoft || `${accent}26`) : undefined }} data-testid={testid}>
    <Icon className="w-5 h-5" style={{ color: accent }} strokeWidth={1.6} />
    <span className="text-white text-xs tracking-[0.2em] font-bold">{label}</span>
  </button>
);

const NavBtn = ({ icon: Icon, label, active = false, onClick, testid, accent = "#1E90FF", themeSoft }) => (
  <button onClick={onClick} className="py-3 flex flex-col items-center gap-1 border-r last:border-r-0" style={{ borderColor: `${accent}33`, backgroundColor: active ? (themeSoft || `${accent}1A`) : undefined }} data-testid={testid}>
    <Icon className="w-5 h-5" style={{ color: active ? accent : "rgba(255,255,255,0.7)" }} strokeWidth={1.6} />
    <span className="text-[11px] tracking-wider" style={{ color: active ? accent : "rgba(255,255,255,0.7)" }}>{label}</span>
  </button>
);

const DrawerInfo = ({ label, value, mono = false }) => (
  <div className="border border-white/10 px-3 py-2.5">
    <div className="text-[9px] tracking-[0.25em] uppercase text-white/40">{label}</div>
    <div className={`text-sm text-white truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
  </div>
);


// ============ Animated candlestick chart (cosmetic, theme-tinted) ============
const CANDLE_COUNT = 30;
const CandleChart = ({ accent, soft, running }) => {
  const [candles, setCandles] = useState(() => seedCandles(CANDLE_COUNT));
  const lastPriceRef = useRef(candles[candles.length - 1].close);

  // Slow tick: form new candle every 1.6s; faster jitter on running
  useEffect(() => {
    const interval = setInterval(() => {
      setCandles((prev) => {
        const last = lastPriceRef.current;
        const drift = (Math.random() - 0.5) * (running ? 3.0 : 1.6);
        const open = last;
        const close = Math.max(20, open + drift);
        const high = Math.max(open, close) + Math.random() * 1.4;
        const low = Math.min(open, close) - Math.random() * 1.4;
        lastPriceRef.current = close;
        return [...prev.slice(1), { open, close, high, low }];
      });
    }, running ? 900 : 1600);
    return () => clearInterval(interval);
  }, [running]);

  const max = Math.max(...candles.map((c) => c.high));
  const min = Math.min(...candles.map((c) => c.low));
  const range = Math.max(0.5, max - min);
  const W = 320, H = 110, padY = 8;
  const candleW = (W / CANDLE_COUNT) * 0.62;
  const slot = W / CANDLE_COUNT;
  const y = (v) => H - padY - ((v - min) / range) * (H - padY * 2);

  const lastClose = candles[candles.length - 1].close.toFixed(2);
  const firstClose = candles[0].close;
  const delta = ((candles[candles.length - 1].close - firstClose) / firstClose) * 100;

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="text-[9px] tracking-[0.25em] uppercase text-white/55">EA · LIVE</div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-bold" style={{ color: accent }} data-testid="chart-price">{lastClose}</span>
          <span className="text-[10px] font-mono" style={{ color: delta >= 0 ? accent : "rgba(255,255,255,0.55)" }} data-testid="chart-delta">
            {delta >= 0 ? "+" : ""}{delta.toFixed(2)}%
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: 110, backgroundColor: soft }} data-testid="chart-svg">
        {/* horizontal grid lines */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1="0" x2={W} y1={H * p} y2={H * p} stroke={accent} strokeOpacity="0.08" strokeDasharray="2,3" />
        ))}
        {candles.map((c, i) => {
          const cx = i * slot + slot / 2;
          const up = c.close >= c.open;
          const color = up ? accent : "rgba(255,255,255,0.55)";
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1" />
              <rect
                x={cx - candleW / 2}
                y={y(Math.max(c.open, c.close))}
                width={candleW}
                height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
                fill={up ? color : "transparent"}
                stroke={color}
                strokeWidth="1"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

function seedCandles(n) {
  let p = 1000 + Math.random() * 50;
  const out = [];
  for (let i = 0; i < n; i++) {
    const open = p;
    const close = open + (Math.random() - 0.5) * 2.5;
    const high = Math.max(open, close) + Math.random() * 1.2;
    const low = Math.min(open, close) - Math.random() * 1.2;
    out.push({ open, close, high, low });
    p = close;
  }
  return out;
}

// ============ Pairs drawer ============
const DIRECTIONS = ["BUY", "SELL", "BOTH"];

const PairsDrawer = ({ email, license, allowedSymbols, pairConfigs, setEaData, theme, accent, onClose }) => {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const configuredSet = new Set((pairConfigs || []).map((c) => c.symbol));
  const available = allowedSymbols.filter((s) => !configuredSet.has(s));

  const refresh = async () => {
    try {
      const { data } = await api.post("/mobile/activate-license", { email, license_key: license });
      setEaData(data);
    } catch { /* noop */ }
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/92 backdrop-blur-sm flex flex-col overflow-y-auto" data-testid="mobile-pairs-drawer">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="font-display tracking-[0.22em] uppercase text-sm flex items-center gap-2" style={{ color: accent }}>
          <TrendingUp className="w-4 h-4" /> Pairs
        </h2>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center" style={{ border: `1px solid ${accent}66`, color: accent }} data-testid="mobile-pairs-close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-5">
        {/* Selected pairs to trade */}
        <section data-testid="pairs-selected-section">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] tracking-[0.25em] uppercase text-white/55">Selected pairs to trade</h3>
            <span className="text-[10px] tracking-[0.22em] uppercase text-white/45">{pairConfigs.length}</span>
          </div>
          {pairConfigs.length === 0 ? (
            <div className="border border-white/10 p-4 text-center text-xs text-white/45" data-testid="pairs-selected-empty">
              No pairs selected yet — tap one from the Allowed list below.
            </div>
          ) : (
            <div className="space-y-2">
              {pairConfigs.map((c) => (
                <PairCard key={c.symbol} cfg={c} accent={accent} theme={theme}
                  email={email} license={license} onSaved={refresh}
                  onRemoved={refresh} />
              ))}
            </div>
          )}
        </section>

        {/* Allowed pairs (from mentor's EA) */}
        <section data-testid="pairs-allowed-section">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] tracking-[0.25em] uppercase text-white/55">Allowed pairs · mentor EA</h3>
            <span className="text-[10px] tracking-[0.22em] uppercase text-white/45">{allowedSymbols.length}</span>
          </div>
          {allowedSymbols.length === 0 ? (
            <div className="border border-white/10 p-4 text-center text-xs text-white/45" data-testid="pairs-allowed-empty">
              Your mentor hasn't added any pairs to this EA yet.
            </div>
          ) : available.length === 0 ? (
            <div className="border border-white/10 p-4 text-center text-xs text-white/45">
              All allowed pairs are already in your selection above.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {available.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSymbol(s)}
                  className="py-3 px-2 text-xs font-mono tracking-wide transition truncate"
                  style={{
                    border: `2px solid ${selectedSymbol === s ? accent : "rgba(255,255,255,0.12)"}`,
                    color: selectedSymbol === s ? accent : "#fff",
                    backgroundColor: selectedSymbol === s ? theme.soft : "transparent",
                  }}
                  data-testid={`pairs-allowed-${s}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Config form appears when a symbol is selected */}
        {selectedSymbol && (
          <PairConfigForm
            symbol={selectedSymbol}
            email={email}
            license={license}
            accent={accent}
            theme={theme}
            onCancel={() => setSelectedSymbol(null)}
            onSaved={() => { setSelectedSymbol(null); refresh(); }}
          />
        )}
      </div>
    </div>
  );
};

const PairCard = ({ cfg, accent, theme, email, license, onRemoved }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded border p-3" style={{ borderColor: theme.border, backgroundColor: "rgba(0,17,34,0.45)" }} data-testid={`pair-card-${cfg.symbol}`}>
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm font-bold" style={{ color: accent }}>{cfg.symbol}</div>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post("/mobile/pair-config/delete", { email, license_key: license, symbol: cfg.symbol });
              toast.success(`${cfg.symbol} removed`);
              onRemoved();
            } catch (err) {
              toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
            } finally { setBusy(false); }
          }}
          className="w-7 h-7 flex items-center justify-center hover:bg-white/5"
          style={{ border: `1px solid ${accent}55`, color: accent }}
          data-testid={`pair-remove-${cfg.symbol}`}
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
        <Chip color={accent}>{cfg.direction}</Chip>
        <Chip color={accent}>{cfg.platform?.toUpperCase()}</Chip>
        <Chip color="rgba(255,255,255,0.6)">Lot {cfg.lot_size}</Chip>
        <Chip color="rgba(255,255,255,0.6)">×{cfg.max_trades}</Chip>
      </div>
    </div>
  );
};

const Chip = ({ children, color }) => (
  <span className="px-2 py-0.5" style={{ border: `1px solid ${color}55`, color }}>{children}</span>
);

const PairConfigForm = ({ symbol, email, license, accent, theme, onCancel, onSaved }) => {
  const [lotSize, setLotSize] = useState("0.01");
  const [direction, setDirection] = useState("BOTH");
  const [platform, setPlatform] = useState("mt4");
  const [maxTrades, setMaxTrades] = useState("1");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/mobile/pair-config", {
        email,
        license_key: license,
        symbol,
        lot_size: parseFloat(lotSize),
        direction,
        platform,
        max_trades: parseInt(maxTrades, 10),
      });
      toast.success(`${symbol} configured`);
      onSaved();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="rounded-lg p-4 space-y-3" style={{ border: `2px solid ${theme.border}`, backgroundColor: "rgba(0,17,34,0.45)" }} data-testid="pair-config-form">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Configure</div>
          <div className="font-mono text-lg font-bold" style={{ color: accent }} data-testid="pair-config-symbol">{symbol}</div>
        </div>
        <button type="button" onClick={onCancel} className="w-8 h-8 flex items-center justify-center" style={{ border: `1px solid ${accent}55`, color: accent }} data-testid="pair-config-cancel">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5 block">Direction</label>
        <div className="grid grid-cols-3 gap-2">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDirection(d)}
              className="py-2 text-xs tracking-[0.22em] uppercase font-bold transition"
              style={{
                border: `2px solid ${direction === d ? accent : "rgba(255,255,255,0.12)"}`,
                color: direction === d ? accent : "rgba(255,255,255,0.75)",
                backgroundColor: direction === d ? theme.soft : "transparent",
              }}
              data-testid={`pair-direction-${d}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5 block">Platform</label>
        <div className="grid grid-cols-2 gap-2">
          {["mt4", "mt5"].map((p) => (
            <button key={p} type="button" onClick={() => setPlatform(p)}
              className="py-2 text-xs tracking-[0.22em] uppercase font-bold"
              style={{
                border: `2px solid ${platform === p ? accent : "rgba(255,255,255,0.12)"}`,
                color: platform === p ? accent : "rgba(255,255,255,0.75)",
                backgroundColor: platform === p ? theme.soft : "transparent",
              }}
              data-testid={`pair-platform-${p}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5 block">Lot size</label>
          <Input
            inputMode="decimal" required value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
            placeholder="0.01"
            className="bg-transparent text-white rounded-none h-10 font-mono"
            style={{ borderColor: `${accent}55` }}
            data-testid="pair-lot-input"
          />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5 block"># Trades</label>
          <Input
            inputMode="numeric" required value={maxTrades}
            onChange={(e) => setMaxTrades(e.target.value)}
            placeholder="1"
            className="bg-transparent text-white rounded-none h-10 font-mono"
            style={{ borderColor: `${accent}55` }}
            data-testid="pair-trades-input"
          />
        </div>
      </div>

      <Button type="submit" disabled={busy} className="w-full text-black font-bold rounded-none h-11 tracking-wide mt-1" style={{ backgroundColor: accent }} data-testid="pair-config-save">
        {busy ? "Saving…" : `Add ${symbol} to selection`}
      </Button>
    </form>
  );
};


// ============ Start popup ============
const StartPopup = ({ eaName, broker, pairs, accent, theme, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    // Positioned only at the bottom — leave action row above tappable.
    <div className="absolute left-0 right-0 bottom-0 z-30 flex items-end justify-center pointer-events-none" data-testid="mobile-start-popup">
      <div
        className="relative w-[calc(100%-1.5rem)] rounded-t-2xl p-4 mb-3 cursor-pointer pointer-events-auto"
        style={{ border: `2px solid ${accent}`, backgroundColor: "rgba(0,17,34,0.97)", boxShadow: `0 -8px 40px ${theme.glow}` }}
        onClick={() => setExpanded((v) => !v)}
        data-testid="mobile-start-popup-card"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex w-3 h-3">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: accent }} />
            <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: accent }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.28em] uppercase text-white/55">{eaName}</div>
            <div className="text-white font-semibold text-sm truncate" data-testid="mobile-start-popup-status">
              {expanded ? "Server connected · waiting for opportunities for execution" : "EA started — tap for details"}
            </div>
          </div>
          <button className="text-white/45 hover:text-white" data-testid="mobile-start-popup-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 max-h-[40vh] overflow-y-auto pr-1" data-testid="mobile-start-popup-expanded">
            <div className="border border-white/10 p-3 text-xs">
              <div className="text-[10px] tracking-[0.22em] uppercase text-white/55">Broker session</div>
              <div className="font-mono text-white mt-1 truncate" data-testid="popup-broker-line">
                {broker?.platform?.toUpperCase() || "—"} · {broker?.server || "—"} · #{broker?.account || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.22em] uppercase text-white/55 mb-1">Active pairs ({pairs.length})</div>
              {pairs.length === 0 ? (
                <div className="text-xs text-white/45 border border-white/10 p-3 text-center">No pairs selected</div>
              ) : (
                <div className="space-y-1">
                  {pairs.map((p) => (
                    <div key={p.symbol} className="border px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs"
                      style={{ borderColor: theme.border }}
                      data-testid={`popup-pair-${p.symbol}`}>
                      <div className="col-span-4 font-mono font-bold" style={{ color: accent }}>{p.symbol}</div>
                      <div className="col-span-3 text-[10px] tracking-[0.18em] uppercase" style={{ color: accent }}>{p.direction}</div>
                      <div className="col-span-3 text-[10px] tracking-[0.18em] uppercase text-white/55">{p.platform?.toUpperCase()}</div>
                      <div className="col-span-2 font-mono text-right text-white/75">{p.lot_size} × {p.max_trades}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
