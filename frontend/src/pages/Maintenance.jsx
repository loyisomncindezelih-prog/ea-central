import { useEffect, useState } from "react";
import { Wrench, RotateCw } from "lucide-react";

const DEFAULT_MSG =
  "Website is being updated — we'll be back online shortly. Thank you for your patience.";

export default function Maintenance({ message }) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const iv = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6 text-white relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 35%, #001a36, #000814 60%, #000208 100%)",
      }}
      data-testid="maintenance-page"
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,144,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(30,144,255,0.10) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Halo */}
      <div
        className="absolute"
        style={{
          width: "70vw",
          height: "70vw",
          top: "-10vw",
          left: "15vw",
          background:
            "radial-gradient(circle, rgba(30,144,255,0.25), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 max-w-2xl w-full text-center">
        <div
          className="inline-flex items-center justify-center w-20 h-20 mb-6 border-2"
          style={{
            borderColor: "#1E90FF",
            backgroundColor: "rgba(30,144,255,0.10)",
            color: "#1E90FF",
            boxShadow: "0 0 32px rgba(30,144,255,0.4)",
            animation: "spin 6s linear infinite",
          }}
        >
          <Wrench className="w-10 h-10" strokeWidth={1.5} />
        </div>

        <div className="text-[11px] tracking-[0.35em] uppercase text-[#1E90FF] mb-3" data-testid="maintenance-tag">
          System update in progress
        </div>

        <h1
          className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-5"
          data-testid="maintenance-heading"
        >
          We're <span className="text-[#1E90FF]">upgrading</span> EA-CENTRAL
          <span style={{ color: "#1E90FF" }}>{dots}</span>
        </h1>

        <p
          className="text-white/75 text-sm sm:text-base leading-relaxed max-w-xl mx-auto"
          data-testid="maintenance-message"
        >
          {message || DEFAULT_MSG}
        </p>

        <div className="mt-10 flex items-center justify-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/40">
          <RotateCw className="w-3 h-3 animate-spin" /> page auto-refreshes every 30s
        </div>

        <div className="mt-2 text-[10px] tracking-[0.22em] uppercase text-white/35">
          status: <span className="text-[#FF8A1F]">offline · maintenance</span>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
