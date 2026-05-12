import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { KeyRound, User as UserIcon, Cpu, Calendar, ArrowRight } from "lucide-react";

const PLANS = [
  { id: "3d",       label: "3",        sub: "Days" },
  { id: "5d",       label: "5",        sub: "Days" },
  { id: "30d",      label: "30",       sub: "Days" },
  { id: "3m",       label: "3",        sub: "Months" },
  { id: "6m",       label: "6",        sub: "Months" },
  { id: "1y",       label: "1",        sub: "Year" },
  { id: "lifetime", label: "Lifetime", sub: "Unlimited access", best: true },
];

export default function GenerateKey() {
  const navigate = useNavigate();
  const [eas, setEas] = useState([]);
  const [holder, setHolder] = useState("");
  const [eaId, setEaId] = useState("");
  const [plan, setPlan] = useState("30d");
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/mentor/eas").then((r) => setEas(r.data)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!confirm) {
      toast.error("Please tick the confirmation checkbox.");
      return;
    }
    if (!eaId) {
      toast.error("Choose an Expert Advisor first.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/mentor/keys", {
        ea_id: eaId,
        holder_username: holder,
        plan,
      });
      toast.success("Licence key generated");
      navigate(`/dashboard/generate-key/success/${data.id}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MentorLayout>
      <div data-testid="generate-key-page" className="max-w-3xl mx-auto">
        {/* Banner */}
        <div className="ea-glass p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[#1E90FF]/25 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 flex items-center justify-center border border-[#1E90FF]/40 bg-[#1E90FF]/10 text-[#1E90FF]">
              <KeyRound className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-5">
              Generate <span className="text-[#1E90FF]">Licence Key</span>
            </h1>
            <p className="text-white/65 text-sm mt-2">
              Authorise a user by selecting their EA and subscription plan below.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="ea-glass mt-6 p-6 sm:p-8 space-y-7" data-testid="generate-key-form">
          {/* Username */}
          <div>
            <Label className="flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2">
              <UserIcon className="w-3.5 h-3.5" /> Username
            </Label>
            <Input
              required
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="Enter the account holder's name"
              className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12"
              data-testid="gk-holder"
            />
          </div>

          {/* EA selector */}
          <div>
            <Label className="flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2">
              <Cpu className="w-3.5 h-3.5" /> Expert Advisor
            </Label>
            {eas.length === 0 ? (
              <div className="border border-white/15 px-4 py-4 text-sm text-white/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid="gk-no-eas">
                <span>You don't have any EAs yet. Add one first to issue licences.</span>
                <Link to="/dashboard/manage-eas">
                  <Button className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-10 px-4 text-xs tracking-wide">
                    Create EA <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            ) : (
              <select
                required
                value={eaId}
                onChange={(e) => setEaId(e.target.value)}
                className="w-full bg-black border border-white/20 focus:border-[#1E90FF] focus:outline-none text-white rounded-none h-12 px-3 font-mono text-sm"
                data-testid="gk-ea-select"
              >
                <option value="" disabled className="bg-black">Choose an Expert Advisor</option>
                {eas.map((ea) => (
                  <option key={ea.id} value={ea.id} className="bg-black">
                    {ea.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Plan */}
          <div>
            <Label className="flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase text-white/55 mb-3">
              <Calendar className="w-3.5 h-3.5" /> Subscription plan
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PLANS.map((p) => {
                const active = plan === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlan(p.id)}
                    data-testid={`gk-plan-${p.id}`}
                    className={`relative px-3 py-5 border text-center transition ${
                      active
                        ? "border-[#1E90FF] bg-[#1E90FF]/10 text-white shadow-[0_0_24px_rgba(30,144,255,0.25)]"
                        : "border-white/15 hover:border-white/40 text-white/85"
                    }`}
                  >
                    {p.best && (
                      <span className="absolute -top-2 right-2 text-[9px] tracking-[0.2em] uppercase bg-[#1E90FF] text-black px-2 py-0.5 font-bold">
                        Best value
                      </span>
                    )}
                    <div className={`font-display text-2xl font-bold ${active ? "text-[#1E90FF]" : "text-white"}`}>
                      {p.label}
                    </div>
                    <div className="mt-1 text-[10px] tracking-[0.2em] uppercase text-white/55">{p.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confirm */}
          <label className="flex items-start gap-3 border border-white/15 p-4 cursor-pointer" data-testid="gk-confirm-box">
            <Checkbox
              checked={confirm}
              onCheckedChange={(v) => setConfirm(Boolean(v))}
              className="mt-1 border-white/30 data-[state=checked]:bg-[#1E90FF] data-[state=checked]:border-[#1E90FF] data-[state=checked]:text-black"
              data-testid="gk-confirm"
            />
            <span className="text-xs text-white/70 leading-relaxed">
              <span className="text-white font-semibold">I confirm</span> that the details above are correct and I want to generate a licence key for this user.
            </span>
          </label>

          <Button
            type="submit"
            disabled={loading || eas.length === 0}
            className="w-full bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 tracking-wide disabled:opacity-50"
            data-testid="gk-submit"
          >
            {loading ? "Generating…" : (
              <>
                <KeyRound className="w-4 h-4 mr-2" />
                Generate Licence Key
              </>
            )}
          </Button>
        </form>
      </div>
    </MentorLayout>
  );
}
