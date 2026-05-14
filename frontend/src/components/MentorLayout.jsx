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
  Cable,
  User,
} from "lucide-react";

const NAV = [
  { to: "/dashboard",                end: true,  icon: LayoutDashboard, label: "Dashboard" },
  { to: "/dashboard/generate-key",   end: false, icon: KeyRound,        label: "Generate Key" },
  { to: "/dashboard/manage-eas",     end: false, icon: Cpu,             label: "Manage EAs" },
  { to: "/dashboard/key-stats",      end: true,  icon: TrendingUp,      label: "Key Stats" },
  { to: "/dashboard/bridge",         end: true,  icon: Cable,           label: "Bridge" },
  { to: "/dashboard/profile",        end: true,  icon: User,            label: "Profile" },
];

export default function MentorLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white" data-testid="mentor-layout">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-3" data-testid="mentor-sidebar">
          <div className="ea-glass p-4 sm:p-5 sticky top-24">
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/40 px-2 mb-3">main</div>
            <nav className="flex lg:flex-col gap-1 overflow-x-auto">
              {NAV.map(({ to, end, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 text-sm transition shrink-0 ${
                      isActive
                        ? "bg-[#1E90FF]/15 text-[#1E90FF] border-l-2 border-[#1E90FF]"
                        : "text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
                    }`
                  }
                  data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                  <span className="tracking-wide">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="hidden lg:block mt-6 pt-5 border-t border-white/5">
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/40 px-2 mb-3">account</div>
              <div className="px-2 mb-3">
                <div className="text-xs text-white/45">Signed in as</div>
                <div className="font-mono text-sm truncate">{user?.username || "—"}</div>
              </div>
              <Button
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="w-full bg-transparent border border-white/15 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-10 text-xs tracking-[0.2em] uppercase"
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
  );
}
