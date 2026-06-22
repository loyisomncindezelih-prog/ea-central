import { Logo } from "./Logo";

export const Footer = () => {
  return (
    <footer className="border-t border-white/10 mt-24" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <Logo />
          <p className="mt-4 text-sm text-white/60 leading-relaxed max-w-sm">
            Host your PC bot, let your clients copy from their phone. No VPS, no extra setup —
            just a mobile EA powered by your terminal.
          </p>
        </div>
        <div>
          <div className="text-xs tracking-[0.22em] uppercase text-white/50 mb-4">Platform</div>
          <ul className="space-y-2 text-sm text-white/80">
            <li><a href="/#features" className="hover:text-[#1E90FF]">Features</a></li>
            <li><a href="/#how" className="hover:text-[#1E90FF]">How it works</a></li>
            <li><a href="/mobile-preview" className="hover:text-[#1E90FF]">Mobile EA preview</a></li>
          </ul>
        </div>
        <div>
          <div className="text-xs tracking-[0.22em] uppercase text-white/50 mb-4">Mentors</div>
          <ul className="space-y-2 text-sm text-white/80">
            <li><a href="/signup" className="hover:text-[#1E90FF]">Become a mentor</a></li>
            <li><a href="/login" className="hover:text-[#1E90FF]">Mentor login</a></li>
            <li><a href="/terms" className="hover:text-[#1E90FF]" data-testid="footer-terms-link">Terms & Conditions</a></li>
            <li>
              <a
                href="https://whatsapp.com/channel/0029VbCShIPLtOjJBZDKZM1y"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-[#25D366] transition"
                data-testid="footer-whatsapp-link"
                style={{ color: "#25D366" }}
              >
                <span className="w-1.5 h-1.5 rounded-full ea-pulse-dot" style={{ background: "#25D366" }} />
                WhatsApp updates channel
              </a>
            </li>
            <li><span className="text-white/40">support@ea-central.com</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-5 flex flex-col md:flex-row gap-3 justify-between text-xs text-white/40">
          <span>© {new Date().getFullYear()} ea-central — all rights reserved.</span>
          <span className="tracking-[0.2em] uppercase flex items-center gap-3">
            <span>Trading involves risk · use responsibly</span>
            <span className="text-white/35" data-testid="site-version">EA-CENTRAL 3.1</span>
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
