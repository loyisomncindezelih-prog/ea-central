export const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_6adc55b9-79fd-4114-b9ca-50702872ede7/artifacts/lmvx6afo_ChatGPT%20Image%20May%2012%2C%202026%2C%2009_13_48%20PM.png";

export const Logo = ({ size = 36, withWord = true, className = "" }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="brand-logo">
      <img
        src={LOGO_URL}
        alt="ea-central"
        width={size}
        height={size}
        className="rounded-md shadow-[0_0_24px_rgba(30,144,255,0.35)]"
        style={{ width: size, height: size }}
      />
      {withWord && (
        <span className="font-display font-extrabold tracking-tight text-white">
          ea<span className="text-[#1E90FF]">-</span>central
        </span>
      )}
    </div>
  );
};

export default Logo;
