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
  Volume2,
  VolumeX,
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
const SS_EA_CACHE = "ea_mobile_eadata_cache";

// Obsidian abstract texture behind the chart-scanner upload zone
const SCANNER_BG =
  "https://images.unsplash.com/photo-1578662996442-48f60103fc96?crop=entropy&cs=srgb&fm=jpg&q=85&w=800";

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

// ---------- Real-time trade notification helpers ----------
// Plays a quick two-tone "ping" so the client knows a trade just hit, even if
// the screen is off or the page is backgrounded.
function playTradeBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);          // A5
    osc.frequency.setValueAtTime(1318.51, now + 0.12); // E6
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.45);
    osc.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
  } catch { /* audio blocked — silent fail */ }
}

// Fires a toast + audio beep + (if granted) a system push notification.
// The "issued_by" field distinguishes admin-pushed trades from automated EA trades.
function notifyOfTrade(s) {
  const act = String(s.action || "").toUpperCase();
  const sym = s.symbol || "—";
  const lot = s.lot != null ? `${s.lot} lot` : "";
  const issuer = s.issued_by === "admin" ? "Mentor took a trade" : "EA took a trade";
  const titleEmoji = act === "BUY" ? "📈" : act === "SELL" ? "📉" : act === "CLOSE" ? "🔒" : "⚡";
  const body = [act, sym, lot].filter(Boolean).join(" ");
  try {
    toast.success(`${titleEmoji} ${issuer}`, {
      description: body,
      duration: 6000,
    });
  } catch { /* ignore */ }
  playTradeBeep();
  // Native browser notification (only fires if the user granted permission once).
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(`${titleEmoji} ${issuer}`, {
        body,
        tag: `trade-${s.id || Date.now()}`,
        silent: false,
      });
      setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 8000);
    }
  } catch { /* ignore */ }
}

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
        try { sessionStorage.setItem(SS_EA_CACHE, JSON.stringify(data)); } catch { /* ignore */ }
        setStage("app");
        return;
      } catch (err) {
        const code = err.response?.status;
        if (code === 410) {
          toast.error("Your licence has expired");
          try { sessionStorage.removeItem(SS_EA_CACHE); } catch { /* ignore */ }
          setEaData(null);
          localStorage.removeItem(LS_LICENSE);
          setLicense("");
          setStage("license");
          return;
        }
        if (!err.response) {
          // Network hiccup — if we already painted from cache, stay in the app.
          try { if (sessionStorage.getItem(SS_EA_CACHE)) return; } catch { /* ignore */ }
        } else {
          // Server rejected the session (device mismatch, revoked key…) — drop the cache.
          try { sessionStorage.removeItem(SS_EA_CACHE); } catch { /* ignore */ }
          setEaData(null);
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

  // Ask the browser once (per device) for permission to show system push
  // notifications when the mentor pushes a trade. Falls back gracefully on iOS
  // Safari where Notification.requestPermission() isn't available outside PWA.
  useEffect(() => {
    if (stage !== "app") return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("ea_notif_asked") === "1") return;
    // Delay so we don't interrupt the welcome popup.
    const t = setTimeout(() => {
      try {
        Notification.requestPermission().then(() => {
          localStorage.setItem("ea_notif_asked", "1");
        });
      } catch { /* iOS Safari outside PWA */ }
    }, 4000);
    return () => clearTimeout(t);
  }, [stage]);

  // Last-3 trade signals (EA status panel) — polls every 3s while running, 8s otherwise.
  // Detects NEW signals between ticks and fires a beep + toast + (optional) system push,
  // so the client gets a real-time alert the moment the mentor pushes a trade.
  const seenSignalIdsRef = useRef(null); // null on first tick → don't notify, just seed
  const lastFlashRef = useRef(0);
  const [signalFlash, setSignalFlash] = useState(0); // tick to flash the terminal border
  useEffect(() => {
    if (stage !== "app" || !email || !license) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.post("/mobile/trade-signals", { email, license_key: license });
        if (cancelled) return;
        const next = data.signals || [];
        setSignals(next);
        // First fetch → seed the set, no notification.
        const seen = seenSignalIdsRef.current;
        if (seen === null) {
          seenSignalIdsRef.current = new Set(next.map((s) => s.id));
          return;
        }
        const fresh = next.filter((s) => s.id && !seen.has(s.id));
        if (fresh.length) {
          fresh.forEach((s) => seen.add(s.id));
          // Most-recent new signal wins the on-screen notification.
          const s = fresh[0];
          notifyOfTrade(s);
          // Throttle the visual flash to once per 1.5s so a burst of signals
          // doesn't stutter.
          const now = Date.now();
          if (now - lastFlashRef.current > 1500) {
            lastFlashRef.current = now;
            setSignalFlash((x) => x + 1);
          }
        }
      } catch { /* swallow */ }
    };
    tick(); // immediate fetch on mount
    const iv = setInterval(tick, running ? 3000 : 8000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [stage, email, license, running]);

  // Re-seed the "seen" set whenever the user changes accounts so we don't fire
  // notifications for signals that pre-date their session.
  useEffect(() => { seenSignalIdsRef.current = null; }, [email, license]);

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
      try { sessionStorage.setItem(SS_EA_CACHE, JSON.stringify(data)); } catch { /* ignore */ }
      toast.success(`Welcome to ${data.ea_name}`);
      setStage("app");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExpire = () => {
    try { sessionStorage.removeItem(SS_EA_CACHE); } catch { /* ignore */ }
    localStorage.removeItem(LS_LICENSE);
    setLicense("");
    setEaData(null);
    setRunning(false);
    setStage("license");
  };

  const fullLogout = () => {
    try { sessionStorage.removeItem(SS_EA_CACHE); } catch { /* ignore */ }
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
              className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-2xl h-14 text-center text-base ea-mobile"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
              data-testid="mobile-email-input"
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full text-black font-bold rounded-2xl h-14 tracking-wide ea-tap text-base"
              style={{ backgroundColor: accent, boxShadow: `0 6px 20px ${accent}55` }}
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
              className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-2xl h-14 text-center ea-license-input text-sm"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
              data-testid="mobile-license-input"
            />
            <Button
              type="submit"
              disabled={busy}
              className="w-full text-black font-bold rounded-2xl h-14 tracking-wide ea-tap text-base"
              style={{ backgroundColor: accent, boxShadow: `0 6px 20px ${accent}55` }}
              data-testid="mobile-license-submit"
            >
              {busy ? "Activating…" : (<>Activate <ArrowRight className="w-4 h-4 ml-2" /></>)}
            </Button>
            <button
              type="button"
              onClick={() => { localStorage.removeItem(LS_EMAIL); setEmail(""); setStage("email"); }}
              className="w-full text-xs tracking-[0.25em] uppercase text-white/40 hover:text-white pt-2 ea-tap"
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
      <div className="flex-1 flex flex-col overflow-y-auto relative ea-mobile" data-testid="mobile-app-screen" style={{ "--ea-accent": accent }}>
        {/* === LUXURY MESH BACKGROUND (no neon halos) === */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 90% 55% at 50% -10%, rgba(255,255,255,0.05) 0%, transparent 60%),
                radial-gradient(ellipse 60% 45% at 85% 105%, rgba(245,208,97,0.06) 0%, transparent 60%),
                radial-gradient(ellipse 60% 45% at 10% 105%, ${accent}0D 0%, transparent 60%),
                #030303
              `,
            }}
          />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="absolute inset-x-0 top-0 h-24" style={{ background: "linear-gradient(180deg, rgba(3,3,3,0.95) 0%, transparent 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: "linear-gradient(0deg, rgba(3,3,3,0.95) 0%, transparent 100%)" }} />
        </div>

        {/* === FOREGROUND CONTENT === */}

        {/* Top bar — minimal luxury */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={() => setMenuOpen(true)} className="w-10 h-10 rounded-xl flex items-center justify-center ea-tap ea-card text-white/85" data-testid="mobile-menu-btn">
            <MenuIcon className="w-4 h-4" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-2">
            {running && (
              <span className="w-1.5 h-1.5 rounded-full ea-pulse-dot" style={{ backgroundColor: "#00E676", boxShadow: "0 0 6px #00E676" }} data-testid="mobile-running-pulse" />
            )}
            <h1 className="ea3-display text-base tracking-tight text-white truncate max-w-[55%] text-center" data-testid="mobile-app-title">
              {eaName}
            </h1>
          </div>
          <button className="w-10 h-10 rounded-xl flex items-center justify-center ea-tap ea-card text-white/85 relative" data-testid="mobile-bell-btn">
            <Bell className="w-4 h-4" strokeWidth={1.8} />
            {running && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
            )}
          </button>
        </div>

        {/* Robot avatar */}
        {tab === "home" && (<>
        <div className="relative z-10 flex justify-center pt-3 sm:pt-5 ea-card-enter">
          <div className="relative" style={{ width: "min(58vw, 200px)", height: "min(58vw, 200px)" }}>
            {/* Outer soft ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, ${accent}66, transparent 40%, ${accent}33, transparent 80%, ${accent}66)`,
                filter: "blur(2px)",
                opacity: running ? 0.9 : 0.5,
              }}
            />
            {/* Inner avatar */}
            <div
              className="absolute inset-[6px] rounded-full overflow-hidden"
              style={{ border: `1px solid rgba(255,255,255,0.10)`, backgroundColor: "#09090B" }}
            >
              {eaData?.mentor_profile_image ? (
                <img src={eaData.mentor_profile_image} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 50%" }} data-testid="mobile-ea-avatar" />
              ) : (
                <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 20%", transform: "scale(2.0)", transformOrigin: "50% 20%" }} data-testid="mobile-ea-avatar-default" />
              )}
            </div>
            {/* Running pulse ring */}
            {running && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none ea-pulse-ring"
                style={{ border: `2px solid ${accent}88` }}
              />
            )}
          </div>
        </div>

        {/* EA name plate — minimalist luxury */}
        <div
          className="relative z-10 mx-5 mt-5 rounded-2xl px-4 py-4 text-center ea-card ea-card-enter"
          data-testid="mobile-ea-nameplate"
          style={{ animationDelay: "0.05s" }}
        >
          <div className="text-[10px] tracking-[0.32em] uppercase mb-1" style={{ color: "rgba(245,208,97,0.75)" }}>Robot</div>
          <div className="ea3-display text-2xl sm:text-3xl text-white break-words leading-tight">
            {eaName}
          </div>
          <div className="text-white/50 text-xs mt-1.5 tracking-wide">Fully automated trading EA</div>
        </div>

        {/* Action row — Dynamic Island segmented pill */}
        <div
          className="relative z-10 mx-5 mt-4 p-1 rounded-full flex items-center gap-1 ea-segmented ea-card-enter"
          style={{ animationDelay: "0.1s", "--ea-accent": accent }}
        >
          <ActionBtn icon={TrendingUp} label="Pairs" accent={accent} testid="mobile-action-pairs"
            onClick={() => setPairsOpen(true)} />
          <ActionBtn icon={running ? Power : Play} label={running ? "Stop" : "Start"} accent={accent} testid="mobile-action-start"
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
          <ActionBtn icon={Info} label="Info" accent={accent} testid="mobile-action-info"
            onClick={() => toast.info(`Mentor: ${eaData?.mentor_username || "—"} · Plan: ${eaData?.plan_label}`)} />
        </div>

        {/* Powered by — minimal chip */}
        <div
          className="relative z-10 mx-5 mt-3 py-2 px-4 flex items-center justify-center gap-2 rounded-full ea-card ea-card-enter"
          style={{ animationDelay: "0.15s" }}
        >
          <span className="text-white/50 text-[11px] tracking-wide">Powered by</span>
          <span className="ea3-display tracking-[0.16em] text-[12px]" style={{ color: "#F5D061" }} data-testid="mobile-powered-by">EA-CENTRAL</span>
          <span className="text-white/40 text-[9px] tracking-[0.18em] uppercase ea-mono" data-testid="mobile-version">v3.1</span>
        </div>

        {/* Trading Style — risk profile picker */}
        {(() => {
          const currentStyle = TRADING_STYLES.find((s) => s.key === eaData?.trading_style);
          const isHighRisk = currentStyle?.risk === "high";
          const isBest = currentStyle?.risk === "best";
          const styleColor = isHighRisk ? "#EF4444" : isBest ? "#00E676" : accent;
          return (
            <button
              type="button"
              onClick={() => setStyleOpen(true)}
              className="relative z-10 mx-5 mt-3 rounded-2xl p-3.5 flex items-center gap-3 text-left ea-card ea-tap-soft ea-card-enter"
              style={{ animationDelay: "0.2s", borderColor: currentStyle ? `${styleColor}44` : undefined }}
              data-testid="mobile-trading-style-card"
            >
              <div
                className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl"
                style={{ backgroundColor: `${styleColor}1A`, color: styleColor }}
              >
                {isHighRisk ? <AlertTriangle className="w-4 h-4" /> : <Crosshair className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">Trading style</div>
                <div className="text-sm font-semibold truncate text-white" data-testid="mobile-trading-style-value">
                  {currentStyle ? currentStyle.label : "Tap to choose"}
                </div>
              </div>
              {isBest && (
                <div className="text-[9px] tracking-[0.22em] uppercase px-2 py-1 font-bold rounded-md" style={{ color: "#00E676", backgroundColor: "rgba(0,230,118,0.10)" }} data-testid="mobile-trading-style-best">
                  BEST
                </div>
              )}
              {isHighRisk && (
                <div className="text-[9px] tracking-[0.22em] uppercase px-2 py-1 font-bold rounded-md" style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.10)" }} data-testid="mobile-trading-style-high">
                  HIGH RISK
                </div>
              )}
            </button>
          );
        })()}

        {/* Robot List */}
        <div className="relative z-10 mx-5 mt-4 ea-card-enter" style={{ animationDelay: "0.25s" }}>
          <div className="text-[10px] tracking-[0.3em] uppercase text-white/40 mb-2 px-1">Robot list</div>
          <div className="rounded-2xl p-3 flex items-center gap-3 ea-card" data-testid="mobile-robot-card">
            <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0" style={{ border: `1px solid ${accent}33`, backgroundColor: "#09090B" }}>
              {eaData?.mentor_profile_image ? (
                <img src={eaData.mentor_profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 32%", transform: "scale(1.7)", transformOrigin: "50% 32%" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white text-sm truncate" data-testid="mobile-robot-name">{eaName}</div>
              <div className="text-xs text-white/45 mt-0.5">Adaptive AI Trading</div>
            </div>
            <button onClick={handleExpire} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition ea-tap text-white/60 hover:text-white" data-testid="mobile-robot-disconnect" title="Disconnect this EA">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Broker bridge status (kept — admin approval visibility) */}
        <div className="relative z-10 mx-5 mt-3 ea-card-enter" style={{ animationDelay: "0.3s" }}>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left ea-card ea-tap-soft"
            style={{
              borderColor: eaData?.broker?.status === "declined"
                ? "rgba(239,68,68,0.40)"
                : (eaData?.broker?.status === "approved" ? `${accent}33` : undefined),
            }}
            data-testid="mobile-broker-status"
          >
            <div
              className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl"
              style={{
                backgroundColor: eaData?.broker?.status === "declined" ? "rgba(239,68,68,0.10)" : `${accent}1A`,
                color: eaData?.broker?.status === "declined" ? "#EF4444" : accent,
              }}
            >
              <Server className="w-4 h-4" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/40">Broker bridge</div>
              {eaData?.broker ? (
                <div className="text-sm text-white truncate font-medium" data-testid="mobile-broker-summary">
                  {eaData.broker.platform?.toUpperCase()} · {eaData.broker.server} · #{eaData.broker.account}
                </div>
              ) : (
                <div className="text-sm text-white/50">Not configured — tap to link MT4 / MT5</div>
              )}
            </div>
            {(() => {
              const s = eaData?.broker?.status;
              const label =
                !eaData?.broker ? "setup" :
                s === "pending_approval" ? "linking" :
                s === "approved" ? "approved" :
                s === "declined" ? "declined" : "configured";
              const color =
                !eaData?.broker ? "rgba(255,255,255,0.35)" :
                s === "declined" ? "#EF4444" :
                s === "pending_approval" ? "#EAB308" :
                s === "approved" ? "#00E676" : accent;
              const bg =
                !eaData?.broker ? "rgba(255,255,255,0.04)" :
                s === "declined" ? "rgba(239,68,68,0.10)" :
                s === "pending_approval" ? "rgba(234,179,8,0.10)" :
                s === "approved" ? "rgba(0,230,118,0.10)" : `${accent}1A`;
              return (
                <div className="text-[10px] tracking-[0.22em] uppercase px-2 py-1 rounded-md font-bold"
                  style={{ color, backgroundColor: bg }}
                  data-testid="mobile-broker-status-badge">
                  {label}
                </div>
              );
            })()}
          </button>

          {/* Rolling status banner — replaces the boring "awaiting admin" copy.
              Cycles fun status messages so the user feels something is happening. */}
          {eaData?.broker?.status === "pending_approval" && (
            <RollingBrokerStatus
              connectedAt={eaData.broker.connected_at}
              accent={accent}
            />
          )}

          {/* Decline reason banner — shown inline when admin declined the broker linking */}
          {eaData?.broker?.status === "declined" && (
            <div
              className="mt-2 rounded-xl p-3 flex items-start gap-2.5"
              style={{ border: "1px solid rgba(239,68,68,0.40)", backgroundColor: "rgba(239,68,68,0.08)" }}
              data-testid="mobile-broker-decline-banner"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#EF4444" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: "#EF4444" }}>Linking declined</div>
                <div className="text-xs text-white/85 mt-0.5 leading-relaxed" data-testid="mobile-broker-decline-reason">
                  {eaData.broker.decision_reason || "Server couldn't authenticate with those credentials."}
                </div>
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="mt-2 text-[10px] tracking-[0.22em] uppercase font-bold px-2.5 py-1 rounded-md ea-tap"
                  style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.10)" }}
                  data-testid="mobile-broker-decline-relink"
                >
                  Re-link broker
                </button>
              </div>
            </div>
          )}
        </div>

        {/* EA Status — terminal-style rolling log (last 5 minutes, max 20 lines) */}
        <div className="relative z-10 mx-5 mt-4 ea-card-enter" data-testid="mobile-ea-status" style={{ animationDelay: "0.35s" }}>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/40">EA Status</div>
              {running && (
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] tracking-[0.22em] uppercase font-bold"
                  style={{
                    color: "#00E676",
                    backgroundColor: "rgba(0,230,118,0.10)",
                  }}
                  data-testid="mobile-ea-live-pill"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] ea-pulse-dot" />
                  Live
                </div>
              )}
            </div>
            <div className="text-[10px] tracking-[0.22em] uppercase ea-mono" style={{ color: signals.length ? accent : "rgba(255,255,255,0.30)" }} data-testid="mobile-ea-status-count">
              {signals.length === 0 ? "idle" : `${signals.length} · last 5m`}
            </div>
          </div>

          <div
            key={`term-${signalFlash}`}
            className="rounded-2xl overflow-hidden ea3-term ea-trade-flash"
            data-testid="mobile-ea-terminal"
          >
            {/* Terminal title bar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
              </div>
              <div className="ea-mono text-[9px] tracking-[0.22em] uppercase text-white/35">ea-central · log</div>
              <div className="ea-mono text-[9px] text-white/25">5m</div>
            </div>

            {/* Terminal body — fixed height, scrolls internally */}
            <div
              className="ea-mono text-[10px] leading-relaxed px-3 py-2.5 overflow-auto ea-scrollbar-hide ea-term-fade"
              style={{ height: 160, color: "rgba(255,255,255,0.85)" }}
              data-testid="mobile-ea-terminal-body"
            >
              {signals.length === 0 ? (
                <div className="space-y-0.5">
                  <div style={{ color: "#00E676" }}>
                    <span style={{ color: accent }}>$</span> ea-central --watch <span className="ea-term-cursor">▊</span>
                  </div>
                  <div style={{ color: "#00E676", opacity: 0.75 }}>
                    [ok] connected · polling every {running ? "3s" : "8s"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.55)" }}>
                    [--] waiting for the mentor's bot to fire a signal…
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)" }}>
                    [--] this log auto-clears every 5 minutes
                  </div>
                  {!running && (
                    <div style={{ color: "#EAB308" }}>
                      [hint] press <span style={{ color: accent, fontWeight: 700 }}>START</span> above to begin receiving live trades
                    </div>
                  )}
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

        <div className="flex-1 min-h-[80px]" />

        {/* Floating dock — Home · Connect · Scanner */}
        <div
          className="relative z-10 mx-4 mb-4 mt-2 rounded-2xl p-1.5 flex items-center gap-1 ea-dock"
          data-testid="mobile-bottom-nav"
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
          <div className="ea3-sheet-wrap ea-mobile" onClick={() => setMenuOpen(false)} data-testid="mobile-menu-drawer">
            <div className="ea3-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="ea3-handle" />
              <div className="flex items-center justify-between px-5 pt-2 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  <h2 className="ea3-display text-base text-white">Menu</h2>
                </div>
                <button onClick={() => setMenuOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center ea-card ea-tap text-white/85" data-testid="mobile-menu-close">
                  <X className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>
              <div className="px-5 pt-1 pb-8 flex flex-col gap-2.5 overflow-y-auto">
                <DrawerInfo label="Account" value={email} />
                <DrawerInfo label="EA" value={eaName} />
                <DrawerInfo label="Licence" value={eaData?.key} mono />
                <DrawerInfo label="Plan" value={eaData?.plan_label} />
                <DrawerInfo label="Expires" value={expiryLabel} />
                <button onClick={() => { setMenuOpen(false); setSettingsOpen(true); }} className="mt-3 rounded-xl ea-card ea-tap text-white py-3 text-xs tracking-[0.22em] uppercase font-semibold flex items-center justify-center gap-2" data-testid="mobile-menu-settings">
                  <SettingsIcon className="w-4 h-4" strokeWidth={1.8} /> Settings
                </button>
                <button onClick={() => navigate("/")} className="rounded-xl ea-card ea-tap text-white py-3 text-xs tracking-[0.22em] uppercase font-semibold flex items-center justify-center gap-2" data-testid="mobile-menu-back-site">
                  Back to ea-central.co
                </button>
                <button onClick={fullLogout} className="mt-1 rounded-xl py-3 text-xs tracking-[0.22em] uppercase font-bold flex items-center justify-center gap-2 ea-tap" style={{ color: accent, backgroundColor: `${accent}1A` }} data-testid="mobile-menu-logout">
                  <LogOut className="w-4 h-4" strokeWidth={1.8} /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings drawer */}
        {settingsOpen && (
          <div className="ea3-sheet-wrap ea-mobile" onClick={() => setSettingsOpen(false)} data-testid="mobile-settings-drawer">
            <div className="ea3-sheet overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="ea3-handle" />
              <div className="flex items-center justify-between px-5 pt-2 pb-3 sticky top-0 z-10" style={{ backgroundColor: "rgba(14,14,16,0.95)", backdropFilter: "blur(20px)" }}>
                <div className="flex items-center gap-2">
                  <SettingsIcon className="w-4 h-4" style={{ color: accent }} strokeWidth={1.8} />
                  <h2 className="ea3-display text-base text-white">Settings</h2>
                </div>
                <button onClick={() => setSettingsOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center ea-card ea-tap text-white/85" data-testid="mobile-settings-close">
                  <X className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>

              <div className="px-5 pt-5 pb-10 flex flex-col gap-6">
                <div>
                  <div className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-3 flex items-center gap-2">
                    <Palette className="w-3 h-3" /> Theme
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {Object.entries(THEMES).map(([k, t]) => (
                      <button
                        key={k}
                        onClick={() => { setTheme(k); toast.success(`Theme: ${t.name}`); }}
                        className="relative py-4 flex flex-col items-center gap-2.5 rounded-xl ea-card ea-tap"
                        style={{
                          borderColor: themeKey === k ? `${t.hex}66` : undefined,
                          backgroundColor: themeKey === k ? `${t.hex}12` : undefined,
                        }}
                        data-testid={`mobile-theme-${k}`}
                      >
                        <span
                          className="w-7 h-7 rounded-full"
                          style={{
                            backgroundColor: t.hex,
                            boxShadow: themeKey === k ? `0 4px 12px ${t.hex}66` : `0 2px 8px ${t.hex}33`,
                          }}
                        />
                        <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: themeKey === k ? t.hex : "rgba(255,255,255,0.85)" }}>{t.name}</span>
                        {k === "gold" && (
                          <span className="absolute -top-1.5 -right-1.5 text-[8px] tracking-[0.18em] uppercase font-extrabold px-1.5 py-0.5 rounded-md" style={{ color: "#000", backgroundColor: "#F5C150" }}>
                            NEW
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1">
                  <div className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-3">Native app</div>
                  <a
                    href="/downloads"
                    className="w-full py-3 text-xs tracking-[0.22em] uppercase font-semibold rounded-xl ea-tap flex items-center justify-center gap-2"
                    style={{ color: accent, backgroundColor: `${accent}1A` }}
                    data-testid="mobile-settings-download-apk"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.8} />
                    Get Android APK
                  </a>
                  <div className="mt-2 text-[11px] leading-relaxed text-white/40">
                    Install the EA-CENTRAL Android app. Same login, same license, opens straight to your dashboard.
                  </div>
                </div>

                <div className="pt-1">
                  <div className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-3">Voice on open</div>
                  <SoundToggle accent={accent} />
                  <div className="mt-2 text-[11px] leading-relaxed text-white/40">
                    Plays a short voice-line ("Let's make money, king") when the app opens. Toggle off to keep the app silent.
                  </div>
                </div>

                <div className="pt-1">
                  <div className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-3">Session</div>
                  <button onClick={fullLogout} className="w-full py-3 text-xs tracking-[0.22em] uppercase font-bold rounded-xl ea-tap flex items-center justify-center gap-2" style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.10)" }} data-testid="mobile-settings-logout">
                    <LogOut className="w-4 h-4" strokeWidth={1.8} /> Sign out
                  </button>
                </div>

                {!isStandalone && (
                  <div className="rounded-xl ea-card p-4 text-center">
                    <div className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5">📱 Tip</div>
                    <div className="text-xs text-white/65 leading-relaxed">
                      On iPhone: tap <span className="text-white font-semibold">Share → "Add to Home Screen"</span> to install ea-central as a full-screen app.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Connect (broker) drawer */}
        {connectOpen && (
          <div className="ea3-sheet-wrap ea-mobile" onClick={() => setConnectOpen(false)} data-testid="mobile-connect-drawer">
            <div className="ea3-sheet overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="ea3-handle" />
              <div className="flex items-center justify-between px-5 pt-2 pb-3 sticky top-0 z-10" style={{ backgroundColor: "rgba(14,14,16,0.95)", backdropFilter: "blur(20px)" }}>
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4" style={{ color: accent }} strokeWidth={1.8} />
                  <h2 className="ea3-display text-base text-white">Broker connection</h2>
                </div>
                <button onClick={() => setConnectOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center ea-card ea-tap text-white/85" data-testid="mobile-connect-close">
                  <X className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>

            {/* When broker is already approved, show a summary card instead of the form
                to prevent the user from accidentally re-submitting and going back to "linking". */}
            {eaData?.broker?.status === "approved" && !brokerRelink ? (
              <div className="px-5 pt-4 pb-8 space-y-4" data-testid="broker-approved-card">
                <div className="ea-card rounded-2xl p-4" style={{ borderColor: "rgba(0,230,118,0.30)" }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full ea-pulse-dot" style={{ backgroundColor: "#00E676" }} />
                    <div className="text-[10px] tracking-[0.28em] uppercase" style={{ color: "#00E676" }}>Approved · live</div>
                  </div>
                  <div className="text-white ea-mono text-sm" data-testid="broker-approved-summary">
                    {eaData.broker.platform?.toUpperCase()} · {eaData.broker.server} · #{eaData.broker.account}
                  </div>
                  <div className="text-[11px] text-white/55 mt-2 leading-relaxed">
                    Your broker is linked and verified server-side. The ea-central bridge will use these credentials to execute trades.
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setBrokerRelink(true)}
                  className="w-full bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-12 text-xs tracking-[0.18em] uppercase font-semibold ea-tap"
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
                  className="text-xs tracking-[0.22em] uppercase text-white/40 hover:text-[#EF4444] py-2 w-full text-center font-semibold ea-tap"
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
                  toast.info(`${data.platform.toUpperCase()} linking… securing connection`);
                  setBrokerRelink(false);
                  setConnectOpen(false);
                } catch (err) {
                  toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
                } finally {
                  setBrokerBusy(false);
                }
              }}
              className="px-5 pt-4 pb-8 flex flex-col gap-4"
              data-testid="mobile-broker-form"
            >
              {/* Server-side approval notice — sets expectation up-front */}
              <div
                className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 ea-card"
                style={{ borderColor: `${accent}33` }}
                data-testid="mobile-broker-wait-notice"
              >
                <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accent }} strokeWidth={1.8} />
                <div className="text-xs text-white/80 leading-relaxed">
                  <span className="font-bold" style={{ color: accent }}>Linking usually takes a few minutes.</span> Our server has to securely verify your broker credentials before any trade can execute. If verification doesn't finish within 60 minutes, the connection auto-times-out and you can re-link.
                </div>
              </div>

              {/* Platform selector */}
              <div>
                <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Trading platform</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setBroker({ ...broker, platform: p.key })}
                      className="py-3 text-xs tracking-[0.22em] uppercase font-bold rounded-xl ea-card ea-tap"
                      style={{
                        borderColor: broker.platform === p.key ? `${accent}66` : undefined,
                        color: broker.platform === p.key ? accent : "rgba(255,255,255,0.55)",
                        backgroundColor: broker.platform === p.key ? `${accent}1A` : undefined,
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

              <div className="rounded-xl ea-card p-3.5 text-[11px] text-white/60 leading-relaxed">
                <div className="text-[10px] tracking-[0.28em] uppercase mb-1.5" style={{ color: accent }}>How it works</div>
                Credentials are stored encrypted on the ea-central server and picked up by the ea-central bridge (a small desktop helper running on your PC/VPS) for automatic MT4/MT5 trade execution.
              </div>

              <Button type="submit" disabled={brokerBusy} className="w-full text-black font-bold rounded-xl h-12 tracking-wide ea-tap" style={{ backgroundColor: accent, boxShadow: `0 6px 18px ${accent}55` }} data-testid="broker-save">
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
                  className="text-xs tracking-[0.22em] uppercase text-white/40 hover:text-white py-2 font-semibold ea-tap"
                  data-testid="broker-unlink"
                >
                  Unlink broker
                </button>
              )}
            </form>
            )}
            </div>
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
           status === "low_balance" ? "Not enough balance — top up your trading account" :
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

const LS_SOUND_MUTED = "ea_mobile_sound_muted";

// Plays "Let's make money king" via the browser's built-in Web Speech API.
// Free, no API key needed, works offline on most modern browsers (incl. iOS Safari, Android Chrome).
// Honours the localStorage mute toggle (set from /app Settings).
const playWelcomeVoice = () => {
  try {
    if (localStorage.getItem(LS_SOUND_MUTED) === "1") return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Cancel any queued speech (defensive — prevents stutter on rapid remounts)
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Let's make money, king.");
    u.rate = 0.95;
    u.pitch = 0.95;
    u.volume = 1;
    // Try to pick a clear English voice — varies by browser/OS.
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /Google US English|Samantha|Daniel|en-US|en_GB/i.test(v.name + v.lang)) ||
      voices.find((v) => v.lang && v.lang.startsWith("en")) ||
      voices[0];
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  } catch { /* silently ignore — non-critical UX feature */ }
};

const WelcomePopup = ({ username, eaName, accent, theme, onDismiss }) => {
  const line = WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)];
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up early" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Night owl";
  const handle = (username || "trader").split(/[@\s]/)[0];

  // Some browsers populate voices async — wait once for voiceschanged then play.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const speak = () => playWelcomeVoice();
    // If voices aren't loaded yet, wait for them.
    if (window.speechSynthesis.getVoices().length === 0) {
      const onVoices = () => { speak(); window.speechSynthesis.removeEventListener("voiceschanged", onVoices); };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      // Fallback in case voiceschanged never fires (some browsers)
      const t = setTimeout(speak, 350);
      return () => { window.speechSynthesis.removeEventListener("voiceschanged", onVoices); clearTimeout(t); };
    }
    // Small delay so it fires after the popup animation begins
    const t = setTimeout(speak, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center px-5 ea-backdrop-enter ea-mobile"
      onClick={onDismiss}
      style={{ backgroundColor: "rgba(9,9,11,0.75)", backdropFilter: "blur(8px)" }}
      data-testid="mobile-welcome-popup"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] rounded-3xl p-7 text-center ea-card-elevated ea-drawer-enter"
      >
        {/* Icon */}
        <div
          className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <TrendingUp className="w-6 h-6" strokeWidth={2} />
        </div>

        <div className="text-[10px] tracking-[0.3em] uppercase mb-1.5" style={{ color: "rgba(245,208,97,0.8)" }}>
          {greeting}
        </div>
        <div className="ea3-display text-2xl text-white" data-testid="mobile-welcome-headline">
          {handle},
        </div>
        <div className="ea3-display text-2xl mt-0.5" style={{ color: accent }}>
          let's make money.
        </div>

        <div className="text-sm text-white/70 leading-relaxed mt-4" data-testid="mobile-welcome-quote">
          {line}
        </div>
        <div className="text-[10px] tracking-[0.25em] uppercase text-white/35 mt-3 ea-mono">
          / {eaName} · ready
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full text-black font-bold text-sm tracking-wide py-3.5 rounded-2xl ea-tap"
          style={{
            backgroundColor: accent,
            boxShadow: `0 6px 20px ${accent}55`,
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
    <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">{label}</label>
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 px-4"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
      data-testid={testid}
    />
  </div>
);

const PhoneFrame = ({ children, standalone = false, accent = "#1E90FF" }) => {
  if (standalone) {
    // Installed as PWA / Add-to-Home — go full screen, no phone bezel
    return (
      <div className="min-h-screen text-white flex flex-col ea-mobile ea3-bg" data-testid="mobile-app-page" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {children}
      </div>
    );
  }
  return (
    <div className="min-h-screen text-white flex items-center justify-center p-3 sm:p-6 md:p-10 relative overflow-hidden ea-mobile ea3-bg ea-dot-grid" data-testid="mobile-app-page" style={{ "--ea-accent": accent }}>
      {/* Desktop ambient halos — subtle, no flashing */}
      <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none hidden md:block opacity-30" style={{ backgroundColor: `${accent}1F` }} />
      <div className="absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none hidden md:block opacity-20" style={{ backgroundColor: `${accent}14` }} />
      {/* Vertical "ticker" hint copy on big screens */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-1 pointer-events-none">
        <div className="text-[10px] tracking-[0.42em] uppercase ea-mono text-white/30" style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>EA-CENTRAL · MOBILE EA</div>
      </div>
      <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-1 pointer-events-none">
        <div className="text-[10px] tracking-[0.42em] uppercase ea-mono text-white/20" style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>LIVE · TRADING · BRIDGE</div>
      </div>

      <div
        className="relative w-full max-w-[400px] rounded-[40px] border border-white/10 p-2 sm:p-2.5"
        style={{
          height: "min(92vh, 850px)",
          background: "linear-gradient(180deg, #161616 0%, #050505 100%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.75), 0 0 90px rgba(245,208,97,0.07)",
        }}
      >
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-b-2xl z-20" />
        <div className="w-full h-full rounded-[34px] bg-[#030303] overflow-hidden flex flex-col">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-white/55 ea-mono shrink-0">
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
  <div className="flex-1 flex flex-col items-center justify-center px-7 relative ea-mobile" data-testid={testid}>
    <div
      className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[120%] aspect-square rounded-full pointer-events-none opacity-50"
      style={{ background: `radial-gradient(circle, ${accent}1F 0%, transparent 55%)`, filter: "blur(40px)" }}
    />
    <div
      className="relative w-14 h-14 rounded-2xl flex items-center justify-center ea-card-elevated"
      style={{ color: accent }}
    >
      <Icon className="w-6 h-6" strokeWidth={1.6} />
    </div>
    <h2 className="relative ea3-display text-3xl mt-7 text-center" style={{ color: "#F8FAFC" }}>{title}</h2>
    <p className="relative text-white/55 text-sm text-center mt-2.5 max-w-xs leading-relaxed">{subtitle}</p>
    <div className="relative w-full mt-8">{children}</div>
    <div className="relative mt-auto pb-3 pt-8 text-[10px] tracking-[0.3em] uppercase text-white/25 flex items-center gap-2">
      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: accent }} />
      ea-central · mobile EA
    </div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testid, highlight = false, accent = "#1E90FF", themeSoft }) => (
  <button
    onClick={onClick}
    className="relative flex-1 h-14 rounded-full flex items-center justify-center gap-2 ea-tap transition-colors duration-200 group"
    style={{
      background: highlight
        ? `linear-gradient(180deg, ${accent} 0%, ${accent}DD 100%)`
        : "transparent",
      boxShadow: highlight ? `0 6px 18px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.25)` : undefined,
    }}
    data-testid={testid}
  >
    {highlight && (
      <span
        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ea-pulse-dot"
        style={{ backgroundColor: "#fff", boxShadow: `0 0 8px #fff` }}
      />
    )}
    <Icon
      className="w-4 h-4 transition-transform duration-200"
      style={{ color: highlight ? "#fff" : "rgba(255,255,255,0.85)" }}
      strokeWidth={2.2}
    />
    <span
      className="text-[11px] tracking-[0.22em] font-bold uppercase"
      style={{ color: highlight ? "#fff" : "rgba(255,255,255,0.85)" }}
    >
      {label}
    </span>
  </button>
);

const NavBtn = ({ icon: Icon, label, active = false, onClick, testid, accent = "#1E90FF", themeSoft }) => (
  <button
    onClick={onClick}
    className="relative flex-1 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 ea-tap transition-colors duration-200"
    style={{
      backgroundColor: active ? `${accent}1A` : "transparent",
    }}
    data-testid={testid}
  >
    <Icon
      className="w-5 h-5 transition-transform duration-200"
      style={{ color: active ? accent : "rgba(255,255,255,0.55)" }}
      strokeWidth={2}
    />
    <span
      className="text-[9px] tracking-[0.2em] font-bold uppercase"
      style={{ color: active ? accent : "rgba(255,255,255,0.55)" }}
    >
      {label}
    </span>
  </button>
);

const DrawerInfo = ({ label, value, mono = false }) => (
  <div className="ea-card rounded-xl px-3.5 py-2.5">
    <div className="text-[9px] tracking-[0.28em] uppercase text-white/35">{label}</div>
    <div className={`text-sm text-white truncate ${mono ? "ea-mono" : ""}`}>{value || "—"}</div>
  </div>
);

// Rolling status messages shown while broker connection is "pending_approval".
// Replaces the boring "awaiting admin approval" — cycles through 6 friendly progress
// lines every 4.5 seconds so the user feels something is actively happening.
// Auto-decline after 1 hour is handled server-side; this banner just keeps engagement up.
const PENDING_LINES = [
  "Linking your broker to ea-central bridge…",
  "Verifying broker credentials securely…",
  "Establishing encrypted MT4/MT5 session…",
  "Checking account permissions with broker…",
  "Syncing market feed for your trading server…",
  "Almost there — finalising secure handshake…",
];

const RollingBrokerStatus = ({ connectedAt, accent }) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setIdx((i) => (i + 1) % PENDING_LINES.length), 4500);
    return () => clearInterval(iv);
  }, []);
  // Time-elapsed indicator (so the user knows roughly where they are in the 1-hour auto-decline window)
  const elapsedMinutes = (() => {
    if (!connectedAt) return null;
    const ms = Date.now() - new Date(connectedAt).getTime();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.floor(ms / 60000));
  })();
  return (
    <div
      className="mt-2 rounded-xl p-3 flex items-start gap-2.5 ea-card-enter"
      style={{ border: "1px solid rgba(234,179,8,0.30)", backgroundColor: "rgba(234,179,8,0.06)" }}
      data-testid="mobile-broker-rolling-status"
    >
      <div className="relative w-4 h-4 mt-0.5 shrink-0">
        <span className="absolute inset-0 rounded-full ea-pulse-ring" style={{ border: "2px solid #EAB308" }} />
        <span className="absolute inset-[3px] rounded-full ea-pulse-dot" style={{ backgroundColor: "#EAB308" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: "#EAB308" }}>
          Establishing connection
        </div>
        <div className="text-xs text-white/85 mt-0.5 leading-relaxed" data-testid="mobile-broker-rolling-line">
          {PENDING_LINES[idx]}
        </div>
        {elapsedMinutes !== null && (
          <div className="text-[10px] text-white/40 mt-1 ea-mono">
            elapsed {elapsedMinutes}m · times out at 60m
          </div>
        )}
      </div>
    </div>
  );
};

// Sound on/off toggle for the "Let's make money king" voice-line played on app open.
const SoundToggle = ({ accent }) => {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(LS_SOUND_MUTED) === "1"; } catch { return false; }
  });

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem(LS_SOUND_MUTED, next ? "1" : "0"); } catch { /* ignore */ }
    if (!next) {
      // Re-enabling — play a preview so the user hears it works.
      playWelcomeVoice();
    } else {
      // Turning off — cancel anything still in the queue.
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-full py-3 px-4 text-xs tracking-[0.22em] uppercase font-semibold rounded-xl ea-card ea-tap flex items-center justify-between"
      style={{
        borderColor: muted ? undefined : `${accent}33`,
        color: muted ? "rgba(255,255,255,0.55)" : accent,
        backgroundColor: muted ? undefined : `${accent}12`,
      }}
      data-testid="mobile-settings-sound-toggle"
    >
      <span className="flex items-center gap-2">
        {muted ? <VolumeX className="w-4 h-4" strokeWidth={1.8} /> : <Volume2 className="w-4 h-4" strokeWidth={1.8} />}
        {muted ? "Voice muted" : "Voice on"}
      </span>
      <span
        className="text-[10px] tracking-[0.22em] uppercase font-bold px-2 py-0.5 rounded-md"
        style={{
          color: muted ? "rgba(255,255,255,0.40)" : accent,
          backgroundColor: muted ? "rgba(255,255,255,0.06)" : `${accent}22`,
        }}
      >
        {muted ? "off" : "on · tap to mute"}
      </span>
    </button>
  );
};

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
    <div className="ea3-sheet-wrap ea-mobile" onClick={onClose} data-testid="mobile-pairs-drawer">
      <div className="ea3-sheet overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="ea3-handle" />
        <div className="flex items-center justify-between px-5 pt-2 pb-3 sticky top-0 z-10" style={{ backgroundColor: "rgba(14,14,16,0.95)", backdropFilter: "blur(20px)" }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: accent }} strokeWidth={1.8} />
            <h2 className="ea3-display text-base text-white">Pairs</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center ea-card ea-tap text-white/85" data-testid="mobile-pairs-close">
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-8 space-y-6">
          {/* Selected pairs to trade */}
          <section data-testid="pairs-selected-section">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[10px] tracking-[0.28em] uppercase text-white/40">Selected to trade</h3>
              <span className="text-[10px] tracking-[0.22em] uppercase ea-mono" style={{ color: accent }}>{pairConfigs.length}</span>
            </div>
            {pairConfigs.length === 0 ? (
              <div className="ea-card rounded-xl p-4 text-center text-xs text-white/40" data-testid="pairs-selected-empty">
                No pairs selected yet — tap one from the Allowed list below.
              </div>
            ) : (
              <div className="space-y-2.5">
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
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[10px] tracking-[0.28em] uppercase text-white/40">Allowed · mentor EA</h3>
              <span className="text-[10px] tracking-[0.22em] uppercase ea-mono text-white/40">{allowedSymbols.length}</span>
            </div>
            {allowedSymbols.length === 0 ? (
              <div className="ea-card rounded-xl p-4 text-center text-xs text-white/40" data-testid="pairs-allowed-empty">
                Your mentor hasn't added any pairs to this EA yet.
              </div>
            ) : available.length === 0 ? (
              <div className="ea-card rounded-xl p-4 text-center text-xs text-white/40">
                All allowed pairs are already in your selection above.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {available.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSymbol(s)}
                    className="py-3 px-2 text-xs ea-mono tracking-wide font-bold truncate rounded-xl ea-card ea-tap"
                    style={{
                      borderColor: selectedSymbol === s ? `${accent}66` : undefined,
                      color: selectedSymbol === s ? accent : "#fff",
                      backgroundColor: selectedSymbol === s ? `${accent}1A` : undefined,
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
    </div>
  );
};

const PairCard = ({ cfg, accent, theme, email, license, onRemoved }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="ea-card rounded-xl p-3.5" data-testid={`pair-card-${cfg.symbol}`}>
      <div className="flex items-center justify-between">
        <div className="ea-mono text-sm font-bold tracking-wide" style={{ color: accent }}>{cfg.symbol}</div>
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
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 ea-tap"
          data-testid={`pair-remove-${cfg.symbol}`}
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase">
        <Chip color={accent}>{cfg.direction}</Chip>
        <Chip color={accent}>{cfg.platform?.toUpperCase()}</Chip>
        <Chip color="rgba(255,255,255,0.45)">Lot {cfg.lot_size}</Chip>
        <Chip color="rgba(255,255,255,0.45)">×{cfg.max_trades}</Chip>
      </div>
    </div>
  );
};

const Chip = ({ children, color }) => (
  <span className="px-2 py-0.5 rounded-md font-semibold" style={{ backgroundColor: `${color === "rgba(255,255,255,0.45)" ? "rgba(255,255,255,0.06)" : color + "1A"}`, color }}>{children}</span>
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
    <form onSubmit={save} className="ea-card-elevated rounded-2xl p-4 space-y-3.5" style={{ borderColor: `${accent}33` }} data-testid="pair-config-form">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">Configure</div>
          <div className="ea-mono text-lg font-bold tracking-wide" style={{ color: accent }} data-testid="pair-config-symbol">{symbol}</div>
        </div>
        <button type="button" onClick={onCancel} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 ea-tap" data-testid="pair-config-cancel">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Direction</label>
        <div className="grid grid-cols-3 gap-2">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDirection(d)}
              className="py-2.5 text-xs tracking-[0.22em] uppercase font-bold rounded-xl ea-card ea-tap"
              style={{
                borderColor: direction === d ? `${accent}66` : undefined,
                color: direction === d ? accent : "rgba(255,255,255,0.55)",
                backgroundColor: direction === d ? `${accent}1A` : undefined,
              }}
              data-testid={`pair-direction-${d}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Platform</label>
        <div className="grid grid-cols-2 gap-2">
          {["mt4", "mt5"].map((p) => (
            <button key={p} type="button" onClick={() => setPlatform(p)}
              className="py-2.5 text-xs tracking-[0.22em] uppercase font-bold rounded-xl ea-card ea-tap"
              style={{
                borderColor: platform === p ? `${accent}66` : undefined,
                color: platform === p ? accent : "rgba(255,255,255,0.55)",
                backgroundColor: platform === p ? `${accent}1A` : undefined,
              }}
              data-testid={`pair-platform-${p}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">Lot size</label>
          <Input
            inputMode="decimal" required value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
            placeholder="0.01"
            className="bg-[#121214] border border-white/8 text-white rounded-xl h-11 ea-mono px-3"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
            data-testid="pair-lot-input"
          />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block"># Trades</label>
          <Input
            inputMode="numeric" required value={maxTrades}
            onChange={(e) => setMaxTrades(e.target.value)}
            placeholder="1"
            className="bg-[#121214] border border-white/8 text-white rounded-xl h-11 ea-mono px-3"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
            data-testid="pair-trades-input"
          />
        </div>
      </div>

      <Button type="submit" disabled={busy} className="w-full text-black font-bold rounded-xl h-12 tracking-wide mt-1 ea-tap" style={{ backgroundColor: accent, boxShadow: `0 6px 18px ${accent}55` }} data-testid="pair-config-save">
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
    <div className="absolute left-0 right-0 bottom-0 z-30 flex items-end justify-center pointer-events-none ea-mobile" data-testid="mobile-start-popup">
      <div
        className="relative w-[calc(100%-1.5rem)] rounded-2xl p-4 mb-4 cursor-pointer pointer-events-auto ea-card-elevated ea-drawer-enter"
        onClick={() => setExpanded((v) => !v)}
        data-testid="mobile-start-popup-card"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 ea-pulse-ring" style={{ backgroundColor: accent }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 ea-pulse-dot" style={{ backgroundColor: accent }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">{eaName}</div>
            <div className="text-white font-semibold text-sm truncate" data-testid="mobile-start-popup-status">
              {expanded ? "Connected · scanning for execution opportunities" : "EA started — tap for details"}
            </div>
          </div>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/5 ea-tap" data-testid="mobile-start-popup-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 max-h-[40vh] overflow-y-auto pr-1" data-testid="mobile-start-popup-expanded">
            <div className="ea-card rounded-xl p-3 text-xs">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">Broker session</div>
              <div className="ea-mono text-white mt-1 truncate" data-testid="popup-broker-line">
                {broker?.platform?.toUpperCase() || "—"} · {broker?.server || "—"} · #{broker?.account || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5">Active pairs ({pairs.length})</div>
              {pairs.length === 0 ? (
                <div className="text-xs text-white/45 ea-card rounded-xl p-3 text-center">No pairs selected</div>
              ) : (
                <div className="space-y-1.5">
                  {pairs.map((p) => (
                    <div key={p.symbol} className="ea-card rounded-lg px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs"
                      data-testid={`popup-pair-${p.symbol}`}>
                      <div className="col-span-4 ea-mono font-bold" style={{ color: accent }}>{p.symbol}</div>
                      <div className="col-span-3 text-[10px] tracking-[0.18em] uppercase font-bold" style={{ color: accent }}>{p.direction}</div>
                      <div className="col-span-3 text-[10px] tracking-[0.18em] uppercase text-white/45">{p.platform?.toUpperCase()}</div>
                      <div className="col-span-2 ea-mono text-right text-white/65">{p.lot_size} × {p.max_trades}</div>
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
  <div className="ea3-sheet-wrap ea-mobile" onClick={onClose} data-testid="mobile-trading-style-drawer">
    <div className="ea3-sheet overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="ea3-handle" />
      <div className="flex items-center justify-between px-5 pt-2 pb-3 sticky top-0 z-10" style={{ backgroundColor: "rgba(14,14,16,0.95)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4" style={{ color: accent }} strokeWidth={1.8} />
          <h2 className="ea3-display text-base text-white">Trading style</h2>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center ea-card ea-tap text-white/85" data-testid="mobile-trading-style-close">
          <X className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>

      <div className="px-5 pb-2 text-[11px] text-white/45 leading-relaxed">
        Pick how the EA trades on your account. This choice is shared with the ea-central team server-side.
      </div>

      <div className="px-5 pt-4 pb-8 space-y-3">
        {TRADING_STYLES.map((s) => {
          const isActive = current === s.key;
          const isHigh = s.risk === "high";
          const isBest = s.risk === "best";
          const accentColor = isHigh ? "#EF4444" : isBest ? "#00E676" : accent;
          return (
            <button
              key={s.key}
              type="button"
              disabled={busy}
              onClick={() => onPick(s)}
              className="w-full text-left rounded-2xl p-4 ea-card ea-tap-soft disabled:opacity-60"
              style={{
                borderColor: isActive ? `${accentColor}66` : undefined,
                backgroundColor: isActive
                  ? (isHigh ? "rgba(239,68,68,0.08)" : isBest ? "rgba(0,230,118,0.08)" : `${accent}12`)
                  : undefined,
              }}
              data-testid={`mobile-trading-style-option-${s.key}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 flex items-center justify-center shrink-0 rounded-xl" style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}>
                  {isHigh ? <AlertTriangle className="w-4 h-4" /> : isBest ? <Crosshair className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold text-base ea3-display" style={{ color: accentColor }}>{s.label}</div>
                    {isBest && (
                      <span className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold rounded-md" style={{ color: "#00E676", backgroundColor: "rgba(0,230,118,0.12)" }}>BEST</span>
                    )}
                    {isHigh && (
                      <span className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold rounded-md" style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.12)" }}>HIGH RISK</span>
                    )}
                  </div>
                  <div className="text-xs text-white/65 mt-1.5 leading-relaxed">{s.blurb}</div>
                  {s.warn && (
                    <div className="mt-2 text-[11px] text-[#EF4444] font-semibold rounded-md px-2.5 py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.08)" }}>
                      ⚠ {s.warn}
                    </div>
                  )}
                </div>
                {isActive && (
                  <div className="text-[9px] tracking-[0.22em] uppercase px-1.5 py-0.5 font-bold shrink-0 self-start rounded-md" style={{ color: accentColor, backgroundColor: `${accentColor}1A` }}>
                    ACTIVE
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
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
    status === "executing"   ? "TOOK" :
                                "PEN";
  const lotStr = s.lot != null ? Number(s.lot).toFixed(2) : "—";
  const order = (s.mt_order_id ? `#${s.mt_order_id}` : "");
  const extra =
    status === "executed"    ? `filled ${order}` :
    status === "closed"      ? "closed by server" :
    status === "failed"      ? (s.error || "rejected") :
    status === "low_balance" ? "Not enough balance — top up your trading account" :
    status === "skipped"     ? "bridge offline" :
    status === "executing"   ? "EA took a trade" :
                                "queued by server";
  return (
    <div className="leading-snug ea3-line-in" data-testid={`mobile-term-line-${s.id}`} style={{ wordBreak: "break-word" }}>
      <span className="text-white/55">[{t}]</span>{" "}
      <span style={{ color, fontWeight: 800 }}>{tag}</span>{" "}
      <span style={{ color: accent, fontWeight: 700 }}>{s.symbol || "—"}</span>{" "}
      <span className="text-white" style={{ fontWeight: 600 }}>{action}</span>{" "}
      <span className="text-white/70">{lotStr} lot</span>{" "}
      <span className="text-white/55">· {extra}</span>
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
      <div className="rounded-3xl px-4 py-4 ea-card">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: "#F5D061" }} />
            <h2 className="ea3-display text-base text-white">Chart Scanner</h2>
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
          className="rounded-3xl p-5 text-center"
          style={{
            border: "1.5px dashed rgba(255,255,255,0.18)",
            backgroundImage: `linear-gradient(rgba(3,3,3,0.85), rgba(3,3,3,0.93)), url(${SCANNER_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
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
              style={{ border: "1px solid rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.05)" }}>
              <Camera className="w-6 h-6 text-white/85" />
            </div>
          </div>
          <div className="text-white text-sm font-semibold">Upload a chart screenshot</div>
          <div className="text-[11px] text-white/55 mt-1 mb-4">JPG · PNG · WEBP · up to 6 MB</div>

          {noTokens ? (
            <button
              onClick={onOpenBuy}
              className="w-full py-3.5 text-xs tracking-[0.22em] uppercase font-bold rounded-full ea3-tap"
              style={{
                color: "#000",
                backgroundColor: accent,
                boxShadow: `0 8px 24px ${accent}40`,
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
              className="w-full py-3.5 text-xs tracking-[0.22em] uppercase font-bold rounded-full ea3-tap disabled:opacity-50"
              style={{
                color: "#000",
                backgroundColor: accent,
                boxShadow: `0 8px 24px ${accent}40`,
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
      className="rounded-3xl p-4 ea-card"
      style={{
        borderColor: `${color}55`,
        boxShadow: `0 12px 36px rgba(0,0,0,0.5), inset 0 0 24px ${color}14`,
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
          className="w-full py-3.5 text-xs tracking-[0.22em] uppercase font-bold rounded-full ea3-tap disabled:opacity-60"
          style={{
            color: "#000",
            backgroundColor: color,
            boxShadow: `0 8px 24px ${color}40`,
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
    <div className="ea3-sheet-wrap ea-mobile" style={{ zIndex: 40 }} onClick={onClose} data-testid="mobile-scanner-buy-modal">
      <div className="ea3-sheet overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="ea3-handle" />
        <div className="flex items-center justify-between px-5 pt-2 pb-2">
          <h2 className="ea3-display text-base text-white">Buy scan tokens</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center ea-card ea3-tap text-white/85" data-testid="mobile-scanner-buy-close">
            <X className="w-4 h-4" />
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
          className="w-full py-3.5 text-xs tracking-[0.22em] uppercase font-bold rounded-full ea3-tap disabled:opacity-50"
          style={{ color: "#000", backgroundColor: accent, boxShadow: `0 8px 24px ${accent}40` }}
          data-testid="mobile-scanner-buy-submit"
        >
          {busy ? "Submitting…" : "I paid — submit for approval"}
        </button>
        <div className="text-[10px] text-white/45 text-center leading-relaxed">
          Admin will approve your purchase within minutes and your scans will be credited automatically.
        </div>
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
