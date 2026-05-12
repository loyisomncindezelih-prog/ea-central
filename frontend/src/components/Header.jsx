import { Link, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl bg-black/70 border-b border-white/10"
      data-testid="site-header"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <Link to="/" data-testid="header-home-link">
          <Logo size={32} />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-xs tracking-[0.22em] uppercase text-white/70">
          <a href="/#features" className="hover:text-white transition" data-testid="nav-features">
            Features
          </a>
          <a href="/#how" className="hover:text-white transition" data-testid="nav-how">
            How it works
          </a>
          <Link to="/mobile-preview" className="hover:text-white transition" data-testid="nav-mobile">
            Mobile EA
          </Link>
        </nav>

        <div className="flex items-center gap-3">
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
      </div>
    </header>
  );
};

export default Header;
