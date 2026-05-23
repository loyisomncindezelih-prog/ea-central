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
  Share,
  Plus,
  Download,
  Crosshair,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Clock,
  Camera,
  Upload,
  Activity,
  Sparkles,
  Coins,
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
const LS_DEVICE = "ea_mobile_device_id";
const LS_INSTALL_DISMISSED = "ea_mobile_install_dismissed";

// Detect iOS Safari (no `beforeinstallprompt` support — must show manual instructions).
function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit;
}

// Stable per-device id so each licence/email is locked to one device.
function getDeviceId() {
  let d = localStorage.getItem(LS_DEVICE);
  if (!d) {
    d = (crypto?.randomUUID?.() || ("d_" + Math.random().toString(36).slice(2) + Date.now().toString(36)));
    localStorage.setItem(LS_DEVICE, d);
  }
  return d;
}

const PLATFORMS = [
  { key: "mt4", label: "MetaTrader 4" },
  { key: "mt5", label: "MetaTrader 5" },
];

const THEMES = {
  blue:  { name: "Blue",  hex: "#1E90FF", soft: "rgba(30,144,255,0.12)",  glow: "rgba(30,144,255,0.45)", border: "rgba(30,144,255,0.70)" },
  red:   { name: "Red",   hex: "#FF3B3B", soft: "rgba(255,59,59,0.12)",   glow: "rgba(255,59,59,0.45)",  border: "rgba(255,59,59,0.70)" },
  green: { name: "Green", hex: "#22C55E", soft: "rgba(34,197,94,0.12)",   glow: "rgba(34,197,94,0.45)",  border: "rgba(34,197,94,0.70)" },
  gold:  { name: "Gold",  hex: "#F5C150", soft: "rgba(245,193,80,0.12)",  glow: "rgba(245,193,80,0.45)", border: "rgba(245,193,80,0.70)" },
};

// Trading style options — risk:'high' renders red w/ warning; 'best' gets a badge.
const TRADING_STYLES = [
  {
    key: "aggressive_scalping",
    label: "Aggressive Scalping",
    risk: "high",
    blurb: "Multiple trades per minute on tight spreads. High-frequency, high-stress.",
    warn: "⚠ You can lose money immediately. Only run with capital you can afford to lose.",
  },
  {
    key: "martingale",
    label: "Martingale",
    risk: "high",
    blurb: "Doubles position after each loss. High risk · high reward.",
    warn: "⚠ A losing streak can wipe your account. Use strict equity stops.",
  },
  {
    key: "scalping",
    label: "Scalping",
    risk: "normal",
    blurb: "Short trades, small targets — steady gains on liquid pairs.",
  },
  {
    key: "swing_trading",
    label: "Swing Trading",
    risk: "normal",
    blurb: "Bot waits for high-probability setups. Holds for days, fewer trades.",
  },
  {
    key: "day_trading",
    label: "Day Trading",
    risk: "best",
    blurb: "Balanced intraday strategy — best risk-reward ratio for most clients.",
  },
];

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
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleBusy, setStyleBusy] = useState(false);
  const [signals, setSignals] = useState([]); // Rolling 5-min EA Status terminal feed
  // Bottom-nav tabs: 'home' (default) | 'connect' | 'scanner'
  const [tab, setTab] = useState("home");
  // Chart Scanner state
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanBalance, setScanBalance] = useState({ scans_balance: 0, scans_plan: null });
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyBusy, setBuyBusy] = useState(false);
  // Welcome popup — fires once per browser session when the user lands on the app stage.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
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
  const [brokerRelink, setBrokerRelink] = useState(false);

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

  // ---- Add to Home Screen prompt (Android = native, iOS = manual instructions) ----
  const [installEvent, setInstallEvent] = useState(null);   // Android: BeforeInstallPromptEvent
  const [showInstallTip, setShowInstallTip] = useState(false);
  const iosSafari = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone) return; // already installed — never prompt
    if (localStorage.getItem(LS_INSTALL_DISMISSED) === "1") return; // user said no

    const onBefore = (e) => {
      e.preventDefault(); // we'll fire it ourselves
      setInstallEvent(e);
      setShowInstallTip(true);
    };
    window.addEventListener("beforeinstallprompt", onBefore);

    // iOS Safari never fires beforeinstallprompt — surface manual instructions
    // after a short delay so it doesn't interrupt the first interaction.
    let iosTimer = null;
    if (iosSafari) {
      iosTimer = setTimeout(() => setShowInstallTip(true), 6000);
    }

    const onInstalled = () => {
      setShowInstallTip(false);
      setInstallEvent(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, [isStandalone, iosSafari]);

  const triggerNativeInstall = useCallback(async () => {
    if (!installEvent) return;
    try {
      installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice?.outcome === "accepted") {
        toast.success("Installing ea-central…");
      }
    } catch { /* ignore */ }
    setInstallEvent(null);
    setShowInstallTip(false);
  }, [installEvent]);

  const dismissInstallTip = useCallback(() => {
    localStorage.setItem(LS_INSTALL_DISMISSED, "1");
    setShowInstallTip(false);
  }, []);

  // Register service worker for PWA / APK packaging support.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/app" }).catch(() => {
      // Silently ignore — the app still works without offline support.
    });
  }, []);

  const setTheme = (k) => {
    setThemeKey(k);
    localStorage.setItem(LS_THEME, k);
  };

  // Auto-resume session on load
  // Hydrate the local `running` flag from server-side ea_session whenever eaData changes.
  // This means: if the user pressed START and closes the app, when they re-open it
  // the screen continues to show START as active until they hit STOP.
  useEffect(() => {
    if (!eaData) return;
    const isRunning = (eaData?.ea_session?.status === "running");
    setRunning(isRunning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eaData?.ea_session?.status]);

  const tryResume = useCallback(async () => {
    const savedEmail = localStorage.getItem(LS_EMAIL);
    const savedLicense = localStorage.getItem(LS_LICENSE);
    if (savedEmail && savedLicense) {
      try {
        const { data } = await api.post("/mobile/activate-license", {
          email: savedEmail,
          license_key: savedLicense,
          device_id: getDeviceId(),
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
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const { data } = await api.post("/mobile/activate-license", { email, license_key: license, device_id: getDeviceId() });
        if (cancelled) return; // discard late responses after the effect has been torn down
        setEaData((prev) => {
          const prevStatus = prev?.broker?.status;
          const newStatus = data?.broker?.status;
          // Guard against out-of-order responses: once admin has approved, do NOT let a
          // slower in-flight request (still carrying "pending_approval") downgrade the UI
          // back to "linking". Only an explicit decline or user-initiated unlink may
          // move us off "approved".
          if (prevStatus === "approved" && newStatus === "pending_approval") {
            return prev;
          }
          if (prevStatus === "pending_approval" && newStatus === "approved") {
            toast.success("Broker successfully linked");
          }
          if (prevStatus === "pending_approval" && newStatus === "declined") {
            toast.error(data?.broker?.decision_reason || "Invalid credentials or server");
          }
          return data;
        });
      } catch { /* swallow polling errors */ }
    }, 4000);
    return () => { cancelled = true; clearInterval(iv); };
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

  // Welcome popup — fires once per browser session the first time the user lands
  // on the app stage. Uses sessionStorage so it returns on next browser open.
  useEffect(() => {
    if (stage !== "app") return;
    if (sessionStorage.getItem("ea_mobile_welcome_seen") === "1") return;
    const t = setTimeout(() => setWelcomeOpen(true), 400);
    return () => clearTimeout(t);
  }, [stage]);

  // Last-3 trade signals (EA status panel) — polls every 3s while running, 8s otherwise.
  useEffect(() => {
    if (stage !== "app" || !email || !license) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.post("/mobile/trade-signals", { email, license_key: license });
        if (!cancelled) setSignals(data.signals || []);
      } catch { /* swallow */ }
    };
    tick(); // immediate fetch on mount
    const iv = setInterval(tick, running ? 3000 : 8000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [stage, email, license, running]);

  // Scan balance — refreshed when entering app or scanner tab, and every 15s while on scanner.
  useEffect(() => {
    if (stage !== "app" || !email || !license) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.post("/mobile/scanner/balance", { email, license_key: license, style: "scalping" });
        if (!cancelled) setScanBalance({ scans_balance: data.scans_balance, scans_plan: data.scans_plan });
      } catch { /* swallow */ }
    };
    tick();
    if (tab !== "scanner") return () => { cancelled = true; };
    const iv = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [stage, email, license, tab]);

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
        device_id: getDeviceId(),
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
    setTab("home");
    setStage("email");
  };

  // ============ SCANNER HANDLERS ============
  const onScanFile = async (file) => {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Image too large. Keep it under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) {
        toast.error("Please upload a JPG, PNG or WEBP image.");
        return;
      }
      setScanBusy(true);
      setScanResult(null);
      try {
        const { data } = await api.post("/mobile/scanner/upload", {
          email,
          license_key: license,
          image_data_url: dataUrl,
          chart_context: null,
        });
        setScanResult(data);
        setScanBalance({ scans_balance: data.scans_balance, scans_plan: data.scans_plan });
        toast.success(`Scan complete: ${data.direction} · ${data.confidence}%`);
      } catch (err) {
        const detail = formatApiErrorDetail(err.response?.data?.detail) || err.message;
        if (err.response?.status === 402) {
          setBuyOpen(true);
          toast.error(detail);
        } else {
          toast.error(detail);
        }
      } finally {
        setScanBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const onExecuteScan = async () => {
    if (!scanResult || !scanResult.id) return;
    setScanBusy(true);
    try {
      await api.post("/mobile/scanner/execute-request", {
        email,
        license_key: license,
        scan_id: scanResult.id,
      });
      setScanResult((r) => ({ ...(r || {}), execution_status: "verifying" }));
      toast.message("Verifying trade for best results — please wait…", { duration: 5000 });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setScanBusy(false);
    }
  };

  const onBuyScans = async (plan, proofDataUrl) => {
    setBuyBusy(true);
    try {
      await api.post("/mobile/scanner/purchase", {
        email,
        license_key: license,
        plan,
        proof_data_url: proofDataUrl,
      });
      setBuyOpen(false);
      toast.success("Submitted! Admin will approve your purchase shortly.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBuyBusy(false);
    }
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
  // Defense-in-depth: only render the app shell when the backend has returned a
  // valid session payload. Even if `stage` is forced to "app" via DevTools, this
  // guard sends the user back to the email screen because `eaData` lives on the
  // server response and cannot be faked client-side.
  if (!eaData || !eaData.ea_name || !eaData.key) {
    return (
      <PhoneFrame standalone={isStandalone} accent={accent}>
        <AuthScreen
          icon={Mail}
          title="Session required"
          subtitle="For your security, please sign in with your email and licence key."
          testid="mobile-session-required"
          accent={accent}
        >
          <Button
            onClick={() => {
              localStorage.removeItem(LS_EMAIL);
              localStorage.removeItem(LS_LICENSE);
              setEmail("");
              setLicense("");
              setStage("email");
            }}
            className="w-full text-black font-bold rounded-none h-12 tracking-wide"
            style={{ backgroundColor: accent }}
            data-testid="mobile-session-required-btn"
          >
            Sign in <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </AuthScreen>
      </PhoneFrame>
    );
  }

  const eaName = eaData?.ea_name || "EA";
  const expiry = eaData?.expires_at ? new Date(eaData.expires_at) : null;
  const expiryLabel = expiry
    ? expiry.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "Lifetime";

  return (
    <PhoneFrame standalone={isStandalone} accent={accent}>
      <div className="flex-1 flex flex-col overflow-y-auto bg-black relative" data-testid="mobile-app-screen">
        {/* === STATIC PREMIUM BACKGROUND (4K vibe — no moving chart) === */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Deep navy base */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 35%, #001a36 0%, #000814 45%, #000208 100%)" }} />
          {/* Big central electric-blue halo behind the robot */}
          <div
            className="absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 w-[140%] aspect-square rounded-full"
            style={{
              background: `radial-gradient(circle, ${accent}33 0%, ${accent}14 22%, transparent 60%)`,
              filter: "blur(28px)",
            }}
          />
          {/* Secondary halo bottom-right for depth */}
          <div
            className="absolute -bottom-24 -right-24 w-[70%] aspect-square rounded-full opacity-40"
            style={{
              background: `radial-gradient(circle, ${accent}1F 0%, transparent 65%)`,
              filter: "blur(24px)",
            }}
          />
          {/* Subtle dot grid texture (4K crisp) */}
          <div
            className="absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage: `radial-gradient(${accent}80 1px, transparent 1px)`,
              backgroundSize: "22px 22px",
            }}
          />
          {/* Diagonal sheen highlight (premium tilt) */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              background: `linear-gradient(135deg, transparent 0%, transparent 40%, ${accent} 50%, transparent 60%, transparent 100%)`,
            }}
          />
          {/* Vignette top + bottom so foreground stays readable */}
          <div className="absolute inset-x-0 top-0 h-32" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-32" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)" }} />
        </div>

        {/* === FOREGROUND CONTENT === */}

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => setMenuOpen(true)} className="w-10 h-10 flex items-center justify-center" style={{ borderColor: `${accent}66`, borderWidth: 1, color: accent }} data-testid="mobile-menu-btn">
            <MenuIcon className="w-5 h-5" />
          </button>
          <h1 className="font-display text-base font-bold tracking-[0.22em] uppercase text-white truncate max-w-[55%] text-center" data-testid="mobile-app-title">
            {eaName}
          </h1>
          <button className="w-10 h-10 flex items-center justify-center relative" style={{ borderColor: `${accent}66`, borderWidth: 1, color: accent }} data-testid="mobile-bell-btn">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: accent }}>
              {running ? "1" : "0"}
            </span>
          </button>
        </div>

        {/* Robot in neon ring */}
        {tab === "home" && (<>
        <div className="relative z-10 flex justify-center py-4 sm:py-6">
          <div
            className="relative rounded-full overflow-hidden"
            style={{
              width: "min(64vw, 230px)",
              height: "min(64vw, 230px)",
              border: `2px solid ${accent}`,
              boxShadow: `0 0 28px ${accent}66, 0 0 60px ${theme.glow}, inset 0 0 22px ${theme.soft}`,
            }}
          >
            {eaData?.mentor_profile_image ? (
              <img src={eaData.mentor_profile_image} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 50%" }} data-testid="mobile-ea-avatar" />
            ) : (
              <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 20%", transform: "scale(2.0)", transformOrigin: "50% 20%" }} data-testid="mobile-ea-avatar-default" />
            )}
          </div>
        </div>

        {/* EA name plate */}
        <div
          className="relative z-10 mx-4 mt-1 rounded-2xl px-4 py-4 text-center"
          style={{
            border: `2px solid ${accent}`,
            backgroundColor: "rgba(0,8,18,0.65)",
            boxShadow: `0 0 20px ${theme.glow}, inset 0 0 16px ${theme.soft}`,
          }}
          data-testid="mobile-ea-nameplate"
        >
          <div className="font-display text-3xl sm:text-4xl font-black tracking-tight break-words" style={{ color: accent, textShadow: `0 0 8px ${accent}99, 0 0 16px ${accent}55` }}>
            {eaName}
          </div>
          <div className="text-white text-sm sm:text-base mt-1 tracking-wider font-semibold" style={{ textShadow: `0 0 4px ${accent}44` }}>Fully automated EA</div>
        </div>

        {/* Action row — PAIRS · START · INFO */}
        <div
          className="relative z-10 mx-4 mt-3 rounded-2xl grid grid-cols-3 overflow-hidden"
          style={{
            border: `2px solid ${accent}99`,
            backgroundColor: "rgba(0,8,18,0.55)",
            boxShadow: `0 0 14px ${theme.glow}, inset 0 0 12px ${theme.soft}`,
          }}
        >
          <ActionBtn icon={TrendingUp} label="PAIRS" accent={accent} testid="mobile-action-pairs"
            onClick={() => setPairsOpen(true)} />
          <ActionBtn icon={Play} label={running ? "STOP" : "START"} accent={accent} testid="mobile-action-start"
            onClick={async () => {
              if (running) {
                try { await api.post("/mobile/ea/stop", { email, license_key: license }); } catch { /* ignore */ }
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

        {/* Powered by EA-CENTRAL */}
        <div
          className="relative z-10 mx-4 mt-3 py-2.5 px-5 flex items-center justify-center gap-3 rounded-full"
          style={{ border: `1.5px solid ${accent}99`, backgroundColor: "rgba(0,8,18,0.65)", boxShadow: `0 0 12px ${theme.glow}, inset 0 0 8px ${theme.soft}` }}
        >
          <span className="text-white text-xs sm:text-sm tracking-wider font-semibold">Powered by</span>
          <span className="font-display font-black tracking-[0.18em] text-sm sm:text-base" style={{ color: accent, textShadow: `0 0 8px ${accent}99, 0 0 14px ${accent}55` }} data-testid="mobile-powered-by">EA-CENTRAL</span>
        </div>

        {/* Trading Style — risk profile picker */}
        {(() => {
          const currentStyle = TRADING_STYLES.find((s) => s.key === eaData?.trading_style);
          const isHighRisk = currentStyle?.risk === "high";
          const isBest = currentStyle?.risk === "best";
          const styleColor = isHighRisk ? "#FF3B3B" : isBest ? "#22C55E" : accent;
          const styleSoft = isHighRisk ? "rgba(255,59,59,0.10)" : isBest ? "rgba(34,197,94,0.10)" : theme.soft;
          return (
            <button
              type="button"
              onClick={() => setStyleOpen(true)}
              className="relative z-10 w-full mx-4 mt-3 rounded-2xl p-3 flex items-center gap-3 text-left"
              style={{
                width: "calc(100% - 2rem)",
                border: `2px solid ${currentStyle ? styleColor : "rgba(255,255,255,0.1)"}`,
                backgroundColor: styleSoft,
                boxShadow: currentStyle ? `0 0 16px ${styleColor}55` : undefined,
              }}
              data-testid="mobile-trading-style-card"
            >
              <div
                className="w-9 h-9 flex items-center justify-center shrink-0 rounded"
                style={{ border: `1px solid ${styleColor}`, color: styleColor, boxShadow: `0 0 10px ${styleColor}55` }}
              >
                {isHighRisk ? <AlertTriangle className="w-4 h-4" /> : <Crosshair className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/55">Trading style</div>
                <div className="text-sm font-bold truncate" style={{ color: currentStyle ? styleColor : "rgba(255,255,255,0.85)" }} data-testid="mobile-trading-style-value">
                  {currentStyle ? currentStyle.label : "Tap to choose"}
                </div>
              </div>
              {isBest && (
                <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1 font-bold" style={{ color: "#22C55E", border: `1px solid #22C55E`, backgroundColor: "rgba(34,197,94,0.08)" }} data-testid="mobile-trading-style-best">
                  BEST
                </div>
              )}
              {isHighRisk && (
                <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1 font-bold" style={{ color: "#FF3B3B", border: `1px solid #FF3B3B`, backgroundColor: "rgba(255,59,59,0.08)" }} data-testid="mobile-trading-style-high">
                  HIGH RISK
                </div>
              )}
            </button>
          );
        })()}

        {/* Robot List */}
        <div className="relative z-10 mx-4 mt-4">
          <div className="text-white text-sm font-bold mb-2 tracking-[0.2em] uppercase" style={{ textShadow: `0 0 4px ${accent}44` }}>Robot List</div>
          <div
            className="rounded-2xl p-3 flex items-center gap-3"
            style={{ border: `1.5px solid ${accent}99`, backgroundColor: "rgba(0,8,18,0.55)", boxShadow: `0 0 14px ${theme.glow}, inset 0 0 12px ${theme.soft}` }}
            data-testid="mobile-robot-card"
          >
            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ border: `1.5px solid ${accent}`, boxShadow: `0 0 10px ${accent}66` }}>
              {eaData?.mentor_profile_image ? (
                <img src={eaData.mentor_profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 32%", transform: "scale(1.7)", transformOrigin: "50% 32%" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate" data-testid="mobile-robot-name" style={{ textShadow: `0 0 4px ${accent}33` }}>{eaName}</div>
              <div className="text-xs font-semibold" style={{ color: accent, textShadow: `0 0 4px ${accent}44` }}>Adaptive AI Trading</div>
            </div>
            <button onClick={handleExpire} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition" style={{ border: `1.5px solid ${accent}`, color: accent, boxShadow: `0 0 6px ${accent}44` }} data-testid="mobile-robot-disconnect" title="Disconnect this EA">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Broker bridge status (kept — admin approval visibility) */}
        <div className="relative z-10 mx-4 mt-3">
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="w-full rounded-2xl p-3 flex items-center gap-3 text-left transition hover:bg-white/[0.04]"
            style={{ border: `1.5px solid ${eaData?.broker?.status === "declined" ? "#FF3B3B" : (eaData?.broker ? `${accent}99` : "rgba(255,255,255,0.18)")}`, backgroundColor: "rgba(0,8,18,0.55)", boxShadow: eaData?.broker?.status === "declined" ? `0 0 12px rgba(255,59,59,0.55)` : (eaData?.broker ? `0 0 10px ${theme.glow}` : undefined) }}
            data-testid="mobile-broker-status"
          >
            <div className="w-9 h-9 flex items-center justify-center shrink-0 rounded" style={{ border: `1.5px solid ${eaData?.broker?.status === "declined" ? "#FF3B3B" : accent}`, color: eaData?.broker?.status === "declined" ? "#FF3B3B" : accent, boxShadow: `0 0 6px ${eaData?.broker?.status === "declined" ? "rgba(255,59,59,0.55)" : `${accent}55`}` }}>
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

          {/* Decline reason banner — shown inline when admin declined the broker linking */}
          {eaData?.broker?.status === "declined" && (
            <div
              className="mt-2 rounded-xl p-3 flex items-start gap-2.5"
              style={{ border: "1.5px solid #FF3B3B", backgroundColor: "rgba(255,59,59,0.10)", boxShadow: "0 0 14px rgba(255,59,59,0.35), inset 0 0 12px rgba(255,59,59,0.10)" }}
              data-testid="mobile-broker-decline-banner"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#FF3B3B" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: "#FF3B3B" }}>Linking declined</div>
                <div className="text-xs text-white/90 mt-0.5 leading-relaxed" data-testid="mobile-broker-decline-reason">
                  {eaData.broker.decision_reason || "Server couldn't authenticate with those credentials."}
                </div>
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="mt-2 text-[10px] tracking-[0.22em] uppercase font-bold px-2.5 py-1 rounded"
                  style={{ color: "#FF3B3B", border: "1px solid #FF3B3B", backgroundColor: "rgba(255,59,59,0.06)" }}
                  data-testid="mobile-broker-decline-relink"
                >
                  Re-link broker
                </button>
              </div>
            </div>
          )}
        </div>

        {/* EA Status — terminal-style rolling log (last 5 minutes, max 20 lines) */}
        <div className="relative z-10 mx-4 mt-3" data-testid="mobile-ea-status">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="text-white text-sm font-bold tracking-[0.2em] uppercase" style={{ textShadow: `0 0 4px ${accent}44` }}>
                EA Status
              </div>
              {running && (
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] tracking-[0.22em] uppercase font-bold"
                  style={{
                    color: "#22C55E",
                    border: "1px solid rgba(34,197,94,0.6)",
                    backgroundColor: "rgba(34,197,94,0.10)",
                    boxShadow: "0 0 8px rgba(34,197,94,0.35)",
                  }}
                  data-testid="mobile-ea-live-pill"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] ea-pulse-dot" />
                  Live · monitoring markets
                </div>
              )}
            </div>
            <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: signals.length ? accent : "rgba(255,255,255,0.4)" }} data-testid="mobile-ea-status-count">
              {signals.length === 0 ? "idle" : `${signals.length} · last 5m`}
            </div>
          </div>

          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: `1px solid ${accent}55`,
              backgroundColor: "rgba(0,4,10,0.85)",
              boxShadow: `inset 0 0 18px ${accent}11, 0 0 12px ${accent}22`,
            }}
            data-testid="mobile-ea-terminal"
          >
            {/* Terminal title bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: `${accent}33`, backgroundColor: "rgba(0,8,18,0.65)" }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FF5F57]" />
                <span className="w-2 h-2 rounded-full bg-[#FEBC2E]" />
                <span className="w-2 h-2 rounded-full bg-[#28C840]" />
              </div>
              <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-white/40">terminal · ea-central</div>
              <div className="font-mono text-[9px] text-white/30">5m window</div>
            </div>

            {/* Terminal body — fixed height, scrolls internally */}
            <div
              className="font-mono text-[11px] leading-snug px-3 py-2 overflow-y-auto"
              style={{ height: 160, color: "rgba(255,255,255,0.85)" }}
              data-testid="mobile-ea-terminal-body"
            >
              {signals.length === 0 ? (
                <div className="text-white/45">
                  <span style={{ color: accent }}>$</span> ea-central --watch<br />
                  <span className="text-white/30">[--]</span> waiting for the mentor's bot…<br />
                  <span className="text-white/30">[--]</span> rolling 5-minute log · polls every {running ? "3s" : "8s"}
                </div>
              ) : (
                signals.map((s) => <TerminalLine key={s.id} s={s} accent={accent} />)
              )}
            </div>
          </div>
        </div>
        </>)}

        {tab === "scanner" && (
          <ScannerPanel
            scanBusy={scanBusy}
            scanResult={scanResult}
            scanBalance={scanBalance}
            accent={accent}
            theme={theme}
            onPickFile={onScanFile}
            onExecute={onExecuteScan}
            onOpenBuy={() => setBuyOpen(true)}
            onClearResult={() => setScanResult(null)}
          />
        )}

        <div className="flex-1" />

        {/* Bottom nav — Home · Connect · Scanner */}
        <div
          className="relative z-10 mx-3 mb-3 mt-4 rounded-2xl grid grid-cols-3 overflow-hidden"
          style={{
            border: `2px solid ${accent}99`,
            backgroundColor: "rgba(0,8,18,0.55)",
            boxShadow: `0 0 14px ${theme.glow}, inset 0 0 12px ${theme.soft}`,
          }}
        >
          <NavBtn icon={Home} label="Home" active={tab === "home"} accent={accent} themeSoft={theme.soft} testid="mobile-nav-home"
            onClick={() => setTab("home")} />
          <NavBtn icon={Server} label="Connect" active={tab === "connect"} accent={accent} testid="mobile-nav-connect"
            onClick={() => { setTab("connect"); setConnectOpen(true); }} />
          <NavBtn icon={Sparkles} label="Scanner" active={tab === "scanner"} accent={accent} themeSoft={theme.soft} testid="mobile-nav-scanner"
            onClick={() => setTab("scanner")} />
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(THEMES).map(([k, t]) => (
                    <button
                      key={k}
                      onClick={() => { setTheme(k); toast.success(`Theme: ${t.name}`); }}
                      className="relative py-4 flex flex-col items-center gap-2 transition rounded-md"
                      style={{
                        border: `2px solid ${themeKey === k ? t.hex : "rgba(255,255,255,0.1)"}`,
                        backgroundColor: themeKey === k ? `${t.hex}22` : "transparent",
                        boxShadow: themeKey === k ? `0 0 18px ${t.hex}66` : undefined,
                      }}
                      data-testid={`mobile-theme-${k}`}
                    >
                      <span className="w-8 h-8 rounded-full" style={{ backgroundColor: t.hex, boxShadow: `0 0 22px ${t.hex}, 0 0 36px ${t.hex}99` }} />
                      <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: themeKey === k ? t.hex : "white", textShadow: themeKey === k ? `0 0 8px ${t.hex}99` : "none" }}>{t.name}</span>
                      {k === "gold" && (
                        <span className="absolute -top-1.5 -right-1.5 text-[8px] tracking-[0.18em] uppercase font-extrabold px-1.5 py-0.5" style={{ color: "#000", backgroundColor: "#F5C150", boxShadow: "0 0 10px rgba(245,193,80,0.8)" }}>
                          NEW
                        </span>
                      )}
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

            {/* When broker is already approved, show a summary card instead of the form
                to prevent the user from accidentally re-submitting and going back to "linking". */}
            {eaData?.broker?.status === "approved" && !brokerRelink ? (
              <div className="px-5 py-4 space-y-4" data-testid="broker-approved-card">
                <div className="border p-4" style={{ borderColor: accent, backgroundColor: theme.soft }}>
                  <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: accent }}>Approved · live</div>
                  <div className="text-white font-mono text-sm" data-testid="broker-approved-summary">
                    {eaData.broker.platform?.toUpperCase()} · {eaData.broker.server} · #{eaData.broker.account}
                  </div>
                  <div className="text-[11px] text-white/55 mt-2">
                    Your broker is linked and verified server-side. The ea-central bridge will use these credentials to execute trades.
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setBrokerRelink(true)}
                  className="w-full bg-transparent border border-white/15 hover:border-[#1E90FF] text-white rounded-none h-11 text-xs tracking-[0.18em] uppercase"
                  data-testid="broker-relink-btn"
                >
                  Re-link with different credentials
                </Button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Unlink broker? You'll need server-side approval again next time.")) return;
                    try {
                      await api.post("/mobile/disconnect-broker", { email, license_key: license });
                    } catch { /* ignore */ }
                    setBroker({ platform: "mt4", server: "", account: "", password: "" });
                    localStorage.removeItem(LS_BROKER);
                    setEaData((d) => ({ ...(d || {}), broker: null }));
                    toast.success("Broker unlinked");
                    setConnectOpen(false);
                  }}
                  className="text-xs tracking-[0.22em] uppercase text-white/45 hover:text-[#FF3B3B] py-2 w-full text-center"
                  data-testid="broker-unlink-from-approved"
                >
                  Unlink broker
                </button>
              </div>
            ) : (
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
                  toast.info(`${data.platform.toUpperCase()} broker linking to server… awaiting server-side verification`);
                  setBrokerRelink(false);
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
              {/* Server-side approval notice — sets expectation up-front */}
              <div
                className="flex items-start gap-2 px-3 py-2.5"
                style={{ border: `1.5px solid ${accent}55`, backgroundColor: theme.soft }}
                data-testid="mobile-broker-wait-notice"
              >
                <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accent }} />
                <div className="text-xs text-white/85 leading-relaxed">
                  <span className="font-bold" style={{ color: accent }}>Linking can take 10 minutes or more</span> — our server has to securely verify your broker credentials before any trade can execute on your account. Hang tight.
                </div>
              </div>

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
            )}
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

        {/* Trading style drawer */}
        {styleOpen && (
          <TradingStyleDrawer
            current={eaData?.trading_style}
            theme={theme}
            accent={accent}
            busy={styleBusy}
            onClose={() => setStyleOpen(false)}
            onPick={async (style) => {
              setStyleBusy(true);
              try {
                const { data } = await api.post("/mobile/trading-style", {
                  email, license_key: license, style: style.key,
                });
                setEaData((d) => ({ ...(d || {}), trading_style: data.style, trading_style_label: data.label }));
                if (style.risk === "high") toast.warning(`${style.label} selected — high risk, trade carefully.`);
                else if (style.risk === "best") toast.success(`${style.label} selected — solid choice.`);
                else toast.success(`${style.label} selected`);
                setStyleOpen(false);
              } catch (err) {
                toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
              } finally {
                setStyleBusy(false);
              }
            }}
          />
        )}

        {/* Buy Scans modal */}
        <BuyScansModal
          open={buyOpen}
          onClose={() => setBuyOpen(false)}
          onSubmit={onBuyScans}
          busy={buyBusy}
          accent={accent}
          theme={theme}
        />

        {/* Add-to-Home-Screen tooltip (iOS Safari = manual instructions, Android = native prompt) */}
        {!isStandalone && showInstallTip && (installEvent || iosSafari) && (
          <InstallPrompt
            ios={iosSafari}
            canNativePrompt={!!installEvent}
            onInstall={triggerNativeInstall}
            onDismiss={dismissInstallTip}
            accent={accent}
            theme={theme}
          />
        )}

        {/* Welcome popup — motivational greeting on first app stage of session */}
        {welcomeOpen && (
          <WelcomePopup
            username={eaData?.holder_username}
            eaName={eaName}
            accent={accent}
            theme={theme}
            onDismiss={() => {
              sessionStorage.setItem("ea_mobile_welcome_seen", "1");
              setWelcomeOpen(false);
            }}
          />
        )}
      </div>
    </PhoneFrame>
  );
}

// ============ small components ============

// SignalRow — one row in the EA Status panel.
// Status palette:
//   pending    = amber (queued)
//   executing  = blue (live execution in progress — pulses)
//   executed   = green (filled)
//   failed     = red
//   low_balance= orange (insufficient margin — distinct from failed)
//   skipped    = grey (bridge offline)
const SignalRow = ({ s, accent, theme }) => {
  const status = s.status || "pending";
  const isUp = s.action === "BUY";
  const isClose = s.action === "CLOSE";
  const statusColor =
    status === "executed"    ? "#22C55E" :
    status === "failed"      ? "#FF3B3B" :
    status === "low_balance" ? "#FF8A1F" :
    status === "skipped"     ? "rgba(255,255,255,0.5)" :
    status === "executing"   ? "#1E90FF" :
    "#F5C150"; // pending
  const ts = s.created_at ? new Date(s.created_at) : null;
  const timeLabel = ts ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "—";
  const isLive = status === "executing" || status === "pending";
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        border: `1.5px solid ${statusColor}66`,
        backgroundColor: "rgba(0,8,18,0.55)",
        boxShadow: `inset 0 0 14px ${statusColor}22`,
      }}
      data-testid={`mobile-signal-${s.id}`}
    >
      <div
        className={`relative w-9 h-9 flex items-center justify-center shrink-0 rounded ${isLive ? "ea-pulse-dot" : ""}`}
        style={{
          border: `1.5px solid ${statusColor}`,
          color: statusColor,
          boxShadow: `0 0 12px ${statusColor}99`,
        }}
      >
        {isClose ? <X className="w-4 h-4" /> : isUp ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
        {/* Live "ping" ring while pending/executing */}
        {isLive && (
          <span
            className="absolute inset-0 rounded animate-ping pointer-events-none"
            style={{ boxShadow: `0 0 0 2px ${statusColor}55` }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-bold text-sm" style={{ color: accent, textShadow: `0 0 8px ${accent}55` }}>{s.symbol}</span>
          <span className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: statusColor }}>{s.action}</span>
          <span className="text-[10px] text-white/45 font-mono">{Number(s.lot || 0).toFixed(2)} lot</span>
        </div>
        <div className="text-[10px] mt-0.5 truncate font-mono" style={{ color: statusColor }} data-testid={`mobile-signal-status-${s.id}`}>
          {status === "executed" && s.mt_order_id ? `#${s.mt_order_id} · filled by server` :
           status === "executed"   ? "filled by server" :
           status === "executing"  ? "executing… server is placing the order" :
           status === "low_balance" ? "low account balance — top up your broker" :
           status === "failed"     ? (s.error || "rejected by broker") :
           status === "skipped"    ? "skipped — bridge offline" :
           "queued by server…"}
        </div>
      </div>
      <div className="text-[10px] font-mono text-white/40 shrink-0" data-testid={`mobile-signal-time-${s.id}`}>{timeLabel}</div>
    </div>
  );
};

const InstallPrompt = ({ ios, canNativePrompt, onInstall, onDismiss, accent, theme }) => (
  <div
    className="absolute left-3 right-3 bottom-3 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300"
    data-testid="mobile-install-prompt"
  >
    <div
      className="border backdrop-blur-md p-3.5 shadow-2xl"
      style={{
        borderColor: `${accent}55`,
        backgroundColor: "rgba(0,17,34,0.92)",
        boxShadow: `0 8px 40px ${accent}33`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 shrink-0 flex items-center justify-center"
          style={{ border: `1px solid ${accent}`, color: accent, backgroundColor: theme.soft }}
        >
          <Download className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.25em] uppercase mb-0.5" style={{ color: accent }}>
            / install ea-central
          </div>
          <div className="text-sm text-white leading-snug">
            {ios && !canNativePrompt ? (
              <>Add to Home Screen for full-screen app: tap <span className="sr-only">Share</span><Share aria-hidden="true" className="inline w-3.5 h-3.5 align-text-bottom mx-0.5" style={{ color: accent }} /> then <span className="font-semibold">Add to Home Screen</span>.</>
            ) : (
              <>Install ea-central as an app on your phone — faster launch, no browser bars.</>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 w-7 h-7 -mt-1 -mr-1 flex items-center justify-center text-white/45 hover:text-white"
          aria-label="Dismiss install prompt"
          data-testid="mobile-install-dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {canNativePrompt && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onInstall}
            className="flex-1 h-10 text-black text-xs font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-2"
            style={{ backgroundColor: accent }}
            data-testid="mobile-install-cta"
          >
            <Plus className="w-3.5 h-3.5" /> Install app
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-4 h-10 text-[11px] tracking-[0.2em] uppercase text-white/55 hover:text-white border border-white/15"
            data-testid="mobile-install-later"
          >
            Later
          </button>
        </div>
      )}
    </div>
  </div>
);

// Welcome popup — motivating greeting shown once per session when the user opens /app.
// Picks a random motivational line so it doesn't feel canned.
const WELCOME_LINES = [
  "Markets are open. Let's make some money.",
  "Today the charts work for you, not the other way round.",
  "Your bot doesn't sleep. Profits don't either.",
  "Discipline beats prediction. Let the EA do its job.",
  "Patience pays. Sit back — the bot's on it.",
  "Big moves start small. Today is your day.",
];

const WelcomePopup = ({ username, eaName, accent, theme, onDismiss }) => {
  const line = WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)];
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up early" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Night owl";
  const handle = (username || "trader").split(/[@\s]/)[0];
  return (
    <div
      className="absolute inset-0 z-40 bg-black/72 backdrop-blur-sm flex items-center justify-center px-5 animate-in fade-in duration-300"
      onClick={onDismiss}
      data-testid="mobile-welcome-popup"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] rounded-2xl p-6 text-center animate-in zoom-in-95 duration-300"
        style={{
          border: `2px solid ${accent}`,
          backgroundColor: "rgba(0,8,18,0.95)",
          boxShadow: `0 0 32px ${theme.glow}, inset 0 0 18px ${theme.soft}`,
        }}
      >
        {/* Money emoji icon ring */}
        <div
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{
            border: `2px solid ${accent}`,
            backgroundColor: theme.soft,
            boxShadow: `0 0 18px ${theme.glow}`,
          }}
        >
          <TrendingUp className="w-8 h-8" style={{ color: accent, filter: `drop-shadow(0 0 6px ${accent})` }} strokeWidth={2.4} />
        </div>

        <div className="text-[10px] tracking-[0.32em] uppercase mb-1" style={{ color: accent, textShadow: `0 0 6px ${accent}99` }}>
          {greeting}
        </div>
        <div className="font-display text-2xl font-black text-white tracking-tight" data-testid="mobile-welcome-headline">
          {handle},
        </div>
        <div className="font-display text-2xl font-black tracking-tight mt-0.5" style={{ color: accent, textShadow: `0 0 10px ${accent}99, 0 0 18px ${accent}55` }}>
          let's make money.
        </div>

        <div className="text-sm text-white/85 leading-relaxed mt-4" data-testid="mobile-welcome-quote">
          {line}
        </div>
        <div className="text-[10px] tracking-[0.22em] uppercase text-white/45 mt-2 font-mono">
          / {eaName} · ready
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full text-black font-extrabold text-xs tracking-[0.22em] uppercase py-3 rounded transition active:scale-[0.97] hover:brightness-110"
          style={{
            backgroundColor: accent,
            boxShadow: `0 0 18px ${theme.glow}, 0 0 32px ${accent}55`,
          }}
          data-testid="mobile-welcome-dismiss"
        >
          Let's go
        </button>
      </div>
    </div>
  );
};


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
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-3 sm:p-6 md:p-10 relative overflow-hidden" data-testid="mobile-app-page">
      {/* Desktop / tablet backdrop — neon-grid + dual halo */}
      <div className="absolute inset-0 ea-grid-anim opacity-25 pointer-events-none hidden md:block" />
      <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none hidden md:block" style={{ backgroundColor: `${accent}22` }} />
      <div className="absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none hidden md:block" style={{ backgroundColor: `${accent}1A` }} />
      {/* Vertical "ticker" hint copy on big screens */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-1 pointer-events-none">
        <div className="text-[10px] tracking-[0.4em] uppercase font-mono" style={{ color: accent, writingMode: "vertical-rl", textOrientation: "mixed" }}>EA-CENTRAL · MOBILE EA</div>
      </div>
      <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-1 pointer-events-none">
        <div className="text-[10px] tracking-[0.4em] uppercase font-mono text-white/30" style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>LIVE · TRADING · BRIDGE</div>
      </div>

      <div
        className="relative w-full max-w-[400px] rounded-[44px] border border-white/15 bg-[#050505] p-2 sm:p-3"
        style={{
          height: "min(92vh, 820px)",
          boxShadow: `0 0 80px ${accent}40, 0 25px 80px rgba(0,0,0,0.8)`,
        }}
      >
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
  <button
    onClick={onClick}
    className="py-5 sm:py-6 flex flex-col items-center gap-2 transition-all duration-200 border-r last:border-r-0 active:scale-95 hover:bg-white/[0.06] relative group"
    style={{
      borderColor: `${accent}44`,
      backgroundColor: highlight ? (themeSoft || `${accent}22`) : "rgba(0,8,18,0.35)",
      boxShadow: highlight ? `inset 0 0 18px ${accent}55, 0 0 10px ${accent}55` : `inset 0 0 10px ${accent}11`,
    }}
    data-testid={testid}
  >
    <Icon
      className="w-8 h-8 sm:w-9 sm:h-9 transition-all duration-200 group-hover:scale-110"
      style={{
        color: accent,
        filter: `drop-shadow(0 0 6px ${accent}77) drop-shadow(0 0 12px ${accent}33)`,
      }}
      strokeWidth={2.2}
    />
    <span
      className="text-white text-xs sm:text-sm tracking-[0.22em] font-extrabold"
      style={{ textShadow: `0 0 6px ${accent}66` }}
    >
      {label}
    </span>
  </button>
);

const NavBtn = ({ icon: Icon, label, active = false, onClick, testid, accent = "#1E90FF", themeSoft }) => (
  <button
    onClick={onClick}
    className="py-4 sm:py-5 flex flex-col items-center gap-1.5 border-r last:border-r-0 active:scale-95 transition-all duration-200 hover:bg-white/[0.06] relative group"
    style={{
      borderColor: `${accent}44`,
      backgroundColor: active ? (themeSoft || `${accent}1F`) : "rgba(0,8,18,0.35)",
      boxShadow: active ? `inset 0 0 16px ${accent}44, 0 0 8px ${accent}55` : "none",
    }}
    data-testid={testid}
  >
    <Icon
      className="w-7 h-7 sm:w-8 sm:h-8 transition-all duration-200 group-hover:scale-110"
      style={{
        color: active ? accent : "rgba(255,255,255,0.9)",
        filter: active
          ? `drop-shadow(0 0 6px ${accent}77) drop-shadow(0 0 12px ${accent}33)`
          : `drop-shadow(0 0 3px rgba(255,255,255,0.3))`,
      }}
      strokeWidth={2.2}
    />
    <span
      className="text-xs sm:text-sm tracking-wider font-bold"
      style={{
        color: active ? accent : "rgba(255,255,255,0.95)",
        textShadow: active ? `0 0 6px ${accent}66` : "none",
      }}
    >
      {label}
    </span>
  </button>
);

const DrawerInfo = ({ label, value, mono = false }) => (
  <div className="border border-white/10 px-3 py-2.5">
    <div className="text-[9px] tracking-[0.25em] uppercase text-white/40">{label}</div>
    <div className={`text-sm text-white truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
  </div>
);

// ============ Pairs drawer ============
const DIRECTIONS = ["BUY", "SELL", "BOTH"];

const PairsDrawer = ({ email, license, allowedSymbols, pairConfigs, setEaData, theme, accent, onClose }) => {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const configuredSet = new Set((pairConfigs || []).map((c) => c.symbol));
  const available = allowedSymbols.filter((s) => !configuredSet.has(s));

  const refresh = async () => {
    try {
      const { data } = await api.post("/mobile/activate-license", { email, license_key: license, device_id: getDeviceId() });
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


// ============ Trading Style Drawer ============
const TradingStyleDrawer = ({ current, theme, accent, busy, onClose, onPick }) => (
  <div className="absolute inset-0 z-30 bg-black/92 backdrop-blur-sm flex flex-col overflow-y-auto" data-testid="mobile-trading-style-drawer">
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <h2 className="font-display tracking-[0.22em] uppercase text-sm flex items-center gap-2" style={{ color: accent }}>
        <Crosshair className="w-4 h-4" /> Trading style
      </h2>
      <button onClick={onClose} className="w-10 h-10 flex items-center justify-center" style={{ border: `1px solid ${accent}66`, color: accent }} data-testid="mobile-trading-style-close">
        <X className="w-5 h-5" />
      </button>
    </div>

    <div className="px-4 pb-2 text-[11px] text-white/55 leading-relaxed">
      Pick how the EA trades on your account. This choice is shared with the ea-central team server-side.
    </div>

    <div className="px-4 py-3 space-y-3">
      {TRADING_STYLES.map((s) => {
        const isActive = current === s.key;
        const isHigh = s.risk === "high";
        const isBest = s.risk === "best";
        const accentColor = isHigh ? "#FF3B3B" : isBest ? "#22C55E" : accent;
        return (
          <button
            key={s.key}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="w-full text-left rounded-2xl p-4 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              border: `2px solid ${isActive ? accentColor : (isHigh ? "rgba(255,59,59,0.35)" : isBest ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.12)")}`,
              backgroundColor: isActive ? (isHigh ? "rgba(255,59,59,0.10)" : isBest ? "rgba(34,197,94,0.10)" : theme.soft) : "rgba(0,17,34,0.55)",
              boxShadow: isActive ? `0 0 18px ${accentColor}66` : undefined,
            }}
            data-testid={`mobile-trading-style-option-${s.key}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center shrink-0 rounded" style={{ border: `1px solid ${accentColor}`, color: accentColor, boxShadow: `0 0 10px ${accentColor}55` }}>
                {isHigh ? <AlertTriangle className="w-4 h-4" /> : isBest ? <Crosshair className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold text-base" style={{ color: accentColor, textShadow: `0 0 10px ${accentColor}55` }}>{s.label}</div>
                  {isBest && (
                    <span className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold" style={{ color: "#22C55E", border: "1px solid #22C55E", backgroundColor: "rgba(34,197,94,0.08)" }}>BEST</span>
                  )}
                  {isHigh && (
                    <span className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold" style={{ color: "#FF3B3B", border: "1px solid #FF3B3B", backgroundColor: "rgba(255,59,59,0.08)" }}>HIGH RISK</span>
                  )}
                </div>
                <div className="text-xs text-white/75 mt-1.5 leading-relaxed">{s.blurb}</div>
                {s.warn && (
                  <div className="mt-2 text-[11px] text-[#FF3B3B] font-semibold border-l-2 border-[#FF3B3B] pl-2 py-1 bg-[#FF3B3B]/[0.07]">
                    {s.warn}
                  </div>
                )}
              </div>
              {isActive && (
                <div className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold shrink-0 self-start" style={{ color: accentColor, border: `1px solid ${accentColor}`, backgroundColor: `${accentColor}10` }}>
                  ACTIVE
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);


// ============ Terminal line (single MT4-Journal-style row) ============
const TerminalLine = ({ s, accent }) => {
  const status = (s.status || "pending").toLowerCase();
  const action = (s.action || "").toUpperCase();
  const ts = s.created_at ? new Date(s.created_at) : null;
  const t = ts ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) : "--:--:--";
  const color =
    status === "executed"    ? "#22C55E" :
    status === "closed"      ? "#9CA3AF" :
    status === "failed"      ? "#FF3B3B" :
    status === "low_balance" ? "#FF8A1F" :
    status === "skipped"     ? "rgba(255,255,255,0.45)" :
    status === "executing"   ? "#1E90FF" :
                                "#F5C150"; // pending
  const tag =
    status === "executed"    ? "OK" :
    status === "closed"      ? "CLS" :
    status === "failed"      ? "ERR" :
    status === "low_balance" ? "BAL" :
    status === "skipped"     ? "SKP" :
    status === "executing"   ? "RUN" :
                                "PEN";
  const lotStr = s.lot != null ? Number(s.lot).toFixed(2) : "—";
  const order = (s.mt_order_id ? `#${s.mt_order_id}` : "");
  const extra =
    status === "executed"    ? `filled ${order}` :
    status === "closed"      ? "closed by server" :
    status === "failed"      ? (s.error || "rejected") :
    status === "low_balance" ? "low margin" :
    status === "skipped"     ? "bridge offline" :
    status === "executing"   ? "placing order…" :
                                "queued by server";
  return (
    <div className="whitespace-nowrap" data-testid={`mobile-term-line-${s.id}`}>
      <span className="text-white/40">[{t}]</span>{" "}
      <span style={{ color, fontWeight: 700 }}>{tag}</span>{" "}
      <span style={{ color: accent, fontWeight: 700 }}>{s.symbol || "—"}</span>{" "}
      <span className="text-white/85">{action}</span>{" "}
      <span className="text-white/55">{lotStr} lot</span>{" "}
      <span className="text-white/45">· {extra}</span>
    </div>
  );
};


// ============ Scanner panel (Chart Scanner tab) ============
const ScannerPanel = ({ scanBusy, scanResult, scanBalance, accent, theme, onPickFile, onExecute, onOpenBuy, onClearResult }) => {
  const fileRef = useRef(null);
  const isUnlimited = scanBalance?.scans_plan === "unlimited";
  const remaining = isUnlimited ? "∞" : (scanBalance?.scans_balance ?? 0);
  const noTokens = !isUnlimited && (scanBalance?.scans_balance ?? 0) <= 0;
  return (
    <div className="relative z-10 px-4 mt-4 space-y-4" data-testid="mobile-scanner-panel">
      <div className="rounded-2xl px-4 py-4" style={{
        border: `2px solid ${accent}`,
        backgroundColor: "rgba(0,8,18,0.7)",
        boxShadow: `0 0 20px ${theme.glow}, inset 0 0 16px ${theme.soft}`,
      }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: accent }} />
            <h2 className="font-display text-base font-bold tracking-[0.22em] uppercase" style={{ color: accent }}>Chart Scanner</h2>
          </div>
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
            style={{
              color: noTokens ? "#FF8A1F" : accent,
              border: `1px solid ${noTokens ? "#FF8A1F" : accent}66`,
              backgroundColor: noTokens ? "rgba(255,138,31,0.10)" : `${accent}11`,
            }}
            data-testid="mobile-scanner-balance"
          >
            <Coins className="w-3 h-3" />
            {remaining}
          </div>
        </div>
        <div className="text-[11px] text-white/55 leading-relaxed">
          AI reads your chart screenshot and gives you direction + confidence.
        </div>
      </div>

      {/* Result OR uploader */}
      {scanResult ? (
        <ScannerResult result={scanResult} accent={accent} theme={theme} onExecute={onExecute} onClear={onClearResult} busy={scanBusy} />
      ) : (
        <div
          className="rounded-2xl p-5 text-center"
          style={{
            border: `2px dashed ${accent}66`,
            backgroundColor: "rgba(0,8,18,0.5)",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
            data-testid="mobile-scanner-file-input"
          />
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ border: `2px solid ${accent}66`, backgroundColor: `${accent}11`, boxShadow: `0 0 18px ${accent}44` }}>
              <Camera className="w-6 h-6" style={{ color: accent }} />
            </div>
          </div>
          <div className="text-white text-sm font-semibold">Upload a chart screenshot</div>
          <div className="text-[11px] text-white/55 mt-1 mb-4">JPG · PNG · WEBP · up to 6 MB</div>

          {noTokens ? (
            <button
              onClick={onOpenBuy}
              className="w-full py-3 text-xs tracking-[0.22em] uppercase font-bold rounded"
              style={{
                color: "#000",
                backgroundColor: accent,
                boxShadow: `0 0 18px ${accent}99`,
              }}
              data-testid="mobile-scanner-buy-tokens"
            >
              <Coins className="w-4 h-4 inline-block mr-2" />
              Buy scan tokens
            </button>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={scanBusy}
              className="w-full py-3 text-xs tracking-[0.22em] uppercase font-bold rounded disabled:opacity-50"
              style={{
                color: "#000",
                backgroundColor: accent,
                boxShadow: `0 0 18px ${accent}99`,
              }}
              data-testid="mobile-scanner-upload-btn"
            >
              {scanBusy ? "Analysing…" : (<><Upload className="w-4 h-4 inline-block mr-2" />Upload chart</>)}
            </button>
          )}

          <button
            onClick={onOpenBuy}
            className="mt-3 text-[11px] text-white/55 hover:text-white tracking-[0.18em] uppercase"
            data-testid="mobile-scanner-buy-link"
          >
            Need more scans? Top up here
          </button>
        </div>
      )}
    </div>
  );
};

const ScannerResult = ({ result, accent, theme, onExecute, onClear, busy }) => {
  const dir = (result.direction || "NEUTRAL").toUpperCase();
  const color =
    dir === "BUY"  ? "#22C55E" :
    dir === "SELL" ? "#FF3B3B" :
                     "#9CA3AF";
  const conf = Math.max(0, Math.min(100, Number(result.confidence || 0)));
  const isExecutable = dir === "BUY" || dir === "SELL";
  const requested = result.execution_status === "verifying";
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        border: `2px solid ${color}`,
        backgroundColor: "rgba(0,8,18,0.75)",
        boxShadow: `0 0 22px ${color}55, inset 0 0 16px ${color}22`,
      }}
      data-testid="mobile-scanner-result"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color }} />
          <span className="text-[10px] tracking-[0.22em] uppercase text-white/55">AI Scan Result</span>
        </div>
        <button onClick={onClear} className="text-white/40 hover:text-white" data-testid="mobile-scanner-result-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="font-display text-3xl font-black" style={{ color, textShadow: `0 0 12px ${color}99` }} data-testid="mobile-scanner-result-direction">
            {dir}
          </div>
          {result.symbol && <div className="font-mono text-sm mt-0.5 text-white/80">{result.symbol}{result.timeframe ? ` · ${result.timeframe.toUpperCase()}` : ""}</div>}
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold" style={{ color: accent }} data-testid="mobile-scanner-result-confidence">{conf}%</div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-white/45">confidence</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full transition-all"
          style={{ width: `${conf}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>

      {result.reasoning && (
        <div className="text-[12px] leading-relaxed text-white/75 mb-3 font-mono" data-testid="mobile-scanner-result-reasoning">
          {result.reasoning}
        </div>
      )}

      {(result.entry || result.stop_loss || result.take_profit) && (
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <ScanMetric label="Entry"      value={result.entry}        color="white" />
          <ScanMetric label="Stop"       value={result.stop_loss}    color="#FF8A1F" />
          <ScanMetric label="Target"     value={result.take_profit}  color="#22C55E" />
        </div>
      )}

      {isExecutable ? (
        <button
          onClick={onExecute}
          disabled={busy || requested}
          className="w-full py-3 text-xs tracking-[0.22em] uppercase font-bold rounded disabled:opacity-60"
          style={{
            color: "#000",
            backgroundColor: color,
            boxShadow: `0 0 18px ${color}99`,
          }}
          data-testid="mobile-scanner-execute-btn"
        >
          {requested
            ? "Verifying trade for best results — please wait…"
            : (busy ? "…" : `Execute ${dir} trade`)}
        </button>
      ) : (
        <div className="text-center text-[11px] text-white/55 py-2 border border-white/10 rounded" data-testid="mobile-scanner-neutral">
          No clear direction — wait for a better setup.
        </div>
      )}
    </div>
  );
};

const ScanMetric = ({ label, value, color }) => (
  <div className="border border-white/10 rounded py-1.5 px-1">
    <div className="text-[9px] tracking-[0.22em] uppercase text-white/45">{label}</div>
    <div className="font-mono text-xs mt-0.5 truncate" style={{ color: color === "white" ? "white" : color }}>{value || "—"}</div>
  </div>
);


// ============ Buy Scan Tokens Modal ============
const BuyScansModal = ({ open, onClose, onSubmit, busy, accent, theme }) => {
  const [plan, setPlan] = useState("100");
  const [proof, setProof] = useState(null); // data URL
  const proofRef = useRef(null);
  if (!open) return null;

  const pickProof = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Proof image too large. Keep it under 3 MB.");
      return;
    }
    const r = new FileReader();
    r.onload = () => setProof(String(r.result || ""));
    r.readAsDataURL(file);
  };

  const submit = () => {
    if (!proof) {
      toast.error("Upload your proof of payment first.");
      return;
    }
    onSubmit(plan, proof);
  };

  const plans = [
    { id: "100",       label: "100 Scans",       price: 350, perk: "Pay-as-you-scan" },
    { id: "unlimited", label: "Unlimited / 30d", price: 730, perk: "Best value · scan all you want" },
  ];

  return (
    <div className="absolute inset-0 z-40 bg-black/92 backdrop-blur-sm flex flex-col overflow-y-auto" data-testid="mobile-scanner-buy-modal">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="font-display tracking-[0.22em] uppercase text-sm" style={{ color: accent }}>Buy Scan Tokens</h2>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center" style={{ border: `1px solid ${accent}66`, color: accent }} data-testid="mobile-scanner-buy-close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 pb-6 space-y-5">
        <div className="space-y-3">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              className="w-full text-left p-4 rounded-xl transition"
              style={{
                border: `2px solid ${plan === p.id ? accent : "rgba(255,255,255,0.12)"}`,
                backgroundColor: plan === p.id ? `${accent}1A` : "rgba(0,8,18,0.55)",
                boxShadow: plan === p.id ? `0 0 18px ${accent}55` : undefined,
              }}
              data-testid={`mobile-scanner-buy-plan-${p.id}`}
            >
              <div className="flex items-baseline justify-between">
                <div className="font-bold text-white">{p.label}</div>
                <div className="font-mono text-lg font-bold" style={{ color: accent }}>R{p.price}.00</div>
              </div>
              <div className="text-[11px] text-white/55 mt-1">{p.perk}</div>
            </button>
          ))}
        </div>

        <div className="rounded-xl p-4" style={{ border: `1px solid ${accent}33`, backgroundColor: "rgba(0,8,18,0.6)" }}>
          <div className="text-[10px] tracking-[0.22em] uppercase text-white/55 mb-2">EFT Payment Details</div>
          <BankRow k="Bank" v="Capitec Bank" />
          <BankRow k="Holder" v="LoyisoFx123$" />
          <BankRow k="Account" v="2195277943" mono />
          <BankRow k="Branch" v="470010" mono />
          <BankRow k="Amount" v={`R${plans.find(p => p.id === plan)?.price}.00`} mono accent={accent} />
          <BankRow k="Reference" v="ea-central scans" />
        </div>

        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-white/55 mb-2">Proof of Payment</div>
          <input ref={proofRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => pickProof(e.target.files?.[0])} data-testid="mobile-scanner-buy-proof-input" />
          <button
            onClick={() => proofRef.current?.click()}
            className="w-full py-3 text-xs tracking-[0.22em] uppercase border rounded"
            style={{ borderColor: `${accent}66`, color: accent, backgroundColor: theme.soft }}
            data-testid="mobile-scanner-buy-proof-pick"
          >
            <Upload className="w-4 h-4 inline-block mr-2" /> {proof ? "Replace proof" : "Upload proof"}
          </button>
          {proof && proof.startsWith("data:image/") && (
            <img src={proof} alt="proof" className="mt-2 w-full max-h-40 object-contain rounded border border-white/10" />
          )}
          {proof && proof.startsWith("data:application/pdf") && (
            <div className="mt-2 text-[11px] text-white/55 font-mono">📄 PDF attached</div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy || !proof}
          className="w-full py-3 text-xs tracking-[0.22em] uppercase font-bold rounded disabled:opacity-50"
          style={{ color: "#000", backgroundColor: accent, boxShadow: `0 0 18px ${accent}99` }}
          data-testid="mobile-scanner-buy-submit"
        >
          {busy ? "Submitting…" : "I paid — submit for approval"}
        </button>
        <div className="text-[10px] text-white/45 text-center leading-relaxed">
          Admin will approve your purchase within minutes and your scans will be credited automatically.
        </div>
      </div>
    </div>
  );
};

const BankRow = ({ k, v, mono = false, accent }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-b-0">
    <span className="text-[11px] text-white/55">{k}</span>
    <span className={`text-[12px] ${mono ? "font-mono" : ""}`} style={accent ? { color: accent, fontWeight: 700 } : { color: "white" }}>{v}</span>
  </div>
);
