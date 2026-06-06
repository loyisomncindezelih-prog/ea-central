import { NavLink, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  KeyRound,
  Cpu,
  TrendingUp,
  LogOut,
  User,
} from "lucide-react";

const NAV = [
  { to: "/dashboard",                end: true,  icon: LayoutDashboard, label: "Dashboard" },
  { to: "/dashboard/generate-key",   end: false, icon: KeyRound,        label: "Generate Key" },
  { to: "/dashboard/manage-eas",     end: false, icon: Cpu,             label: "Manage EAs" },
  { to: "/dashboard/key-stats",      end: true,  icon: TrendingUp,      label: "Key Stats" },
  { to: "/dashboard/profile",        end: true,  icon: User,            label: "Profile" },
];

export default function MentorLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen text-white ea-mobile ea-mesh-bg relative overflow-hidden" data-testid="mentor-layout">
      <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-25" style={{ backgroundColor: "#1E90FF1F" }} />
      <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none opacity-15" style={{ backgroundColor: "#F5C15014" }} />
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      <div className="relative">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Sidebar */}
          <aside className="lg:col-span-3" data-testid="mentor-sidebar">
            <div className="ea-card-elevated rounded-2xl p-3 sm:p-4 sticky top-24">
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/35 px-2 mb-3">main</div>
              <nav className="flex lg:flex-col gap-1 overflow-x-auto ea-scrollbar-hide">
                {NAV.map(({ to, end, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl ea-tap-soft shrink-0 transition ${
                        isActive
                          ? "text-[#1E90FF] font-semibold"
                          : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                      }`
                    }
                    style={({ isActive }) => isActive
                      ? { backgroundColor: "rgba(30,144,255,0.10)" }
                      : undefined
                    }
                    data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.8} />
                    <span className="tracking-wide">{label}</span>
                  </NavLink>
                ))}
              </nav>

              <div className="hidden lg:block mt-5 pt-4 border-t border-white/[0.05]">
                <div className="text-[10px] tracking-[0.3em] uppercase text-white/35 px-2 mb-2">account</div>
                <div className="px-2 mb-3">
                  <div className="text-[10px] tracking-[0.22em] uppercase text-white/35">Signed in as</div>
                  <div className="ea-mono text-sm truncate text-white">{user?.username || "—"}</div>
                </div>
                <Button
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                  className="w-full bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-10 text-xs tracking-[0.22em] uppercase font-semibold ea-tap"
                  data-testid="mentor-logout-btn"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </aside>

          {/* Content */}
          <main className="lg:col-span-9 min-w-0">{children}</main>
        </div>
        <Footer />
      </div>
    </div>
  );
}
