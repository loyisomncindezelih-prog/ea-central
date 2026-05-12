import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl bg-black/80 border-b border-white/10"
      data-testid="site-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 h-16 flex items-center justify-between">
        <Link to="/" data-testid="header-home-link" onClick={close}>
          <Logo size={32} />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[11px] tracking-[0.22em] uppercase text-white/70">
          <a href="/#features" className="hover:text-white transition" data-testid="nav-features">
            Features
          </a>
          <a href="/#how" className="hover:text-white transition" data-testid="nav-how">
            How it works
          </a>
          <a href="/#download" className="hover:text-white transition" data-testid="nav-download">
            Download
          </a>
          <Link to="/mobile-preview" className="hover:text-white transition" data-testid="nav-mobile">
            Mobile EA
          </Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user && user !== false ? (
            <>
              <Link to="/dashboard">
                <Button
                  variant="ghost"
                  className="text-white hover:text-[#1E90FF] hover:bg-white/5"
                  data-testid="header-dashboard-btn"
                >
                  Dashboard
                </Button>
              </Link>
              <Button
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="bg-transparent border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none"
                data-testid="header-logout-btn"
              >
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button
                  variant="ghost"
                  className="text-white hover:text-[#1E90FF] hover:bg-white/5"
                  data-testid="header-login-btn"
                >
                  Login
                </Button>
              </Link>
              <Link to="/signup">
                <Button
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-semibold rounded-none px-5"
                  data-testid="header-mentor-btn"
                >
                  Be a Mentor
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden inline-flex items-center justify-center w-10 h-10 border border-white/15 text-white"
          onClick={() => setOpen((v) => !v)}
          aria-label="menu"
          data-testid="header-mobile-toggle"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-xl" data-testid="header-mobile-menu">
          <div className="px-4 py-5 flex flex-col gap-2 text-sm tracking-[0.18em] uppercase">
            <a href="/#features" onClick={close} className="py-3 border-b border-white/5 text-white/85 hover:text-[#1E90FF]">Features</a>
            <a href="/#how" onClick={close} className="py-3 border-b border-white/5 text-white/85 hover:text-[#1E90FF]">How it works</a>
            <a href="/#download" onClick={close} className="py-3 border-b border-white/5 text-white/85 hover:text-[#1E90FF]">Download</a>
            <Link to="/mobile-preview" onClick={close} className="py-3 border-b border-white/5 text-white/85 hover:text-[#1E90FF]">Mobile EA</Link>
            <div className="flex gap-3 pt-4">
              {user && user !== false ? (
                <>
                  <Link to="/dashboard" onClick={close} className="flex-1">
                    <Button className="w-full bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none">
                      Dashboard
                    </Button>
                  </Link>
                  <Button
                    onClick={async () => {
                      close();
                      await logout();
                      navigate("/");
                    }}
                    className="flex-1 bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none"
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={close} className="flex-1">
                    <Button className="w-full bg-transparent border border-white/20 hover:border-[#1E90FF] text-white rounded-none">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup" onClick={close} className="flex-1">
                    <Button className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none">
                      Be a Mentor
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
