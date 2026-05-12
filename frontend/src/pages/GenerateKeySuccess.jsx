import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, KeyRound, ArrowRight, Calendar, Cpu, User as UserIcon } from "lucide-react";

export default function GenerateKeySuccess() {
  const { id } = useParams();
  const [k, setK] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/mentor/keys/${id}`).then((r) => setK(r.data)).catch(() => {});
  }, [id]);

  const copy = async () => {
    if (!k) return;
    await navigator.clipboard.writeText(k.key);
    setCopied(true);
    toast.success("Licence key copied");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <MentorLayout>
      <div className="max-w-3xl mx-auto" data-testid="key-success-page">
        <div className="ea-glass p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[#1E90FF]/30 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
              <CheckCircle2 className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-5 text-center">
              Key <span className="text-[#1E90FF]">generated</span> successfully.
            </h1>
            <p className="text-white/65 text-sm mt-2 text-center">
              Share this licence key with your subscriber. They'll need it to activate the EA.
            </p>

            {/* The KEY */}
            <div className="mt-8 border border-[#1E90FF]/40 bg-[#1E90FF]/5 p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 font-mono text-base sm:text-xl tracking-[0.18em] text-white break-all" data-testid="success-key-value">
                {k?.key || "—"}
              </div>
              <Button
                onClick={copy}
                className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5"
                data-testid="success-copy-btn"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            {/* Info */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow icon={UserIcon} label="Holder"   value={k?.holder_username} />
              <InfoRow icon={Cpu}      label="EA"       value={k?.ea_name} />
              <InfoRow icon={Calendar} label="Plan"     value={k?.plan_label} />
              <InfoRow icon={KeyRound} label="Status"   value={(k?.status || "").toUpperCase()} />
              <InfoRow icon={Calendar} label="Created"  value={k && new Date(k.created_at).toLocaleString()} fullWidth />
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/dashboard">
                <Button
                  variant="ghost"
                  className="border border-white/20 hover:border-[#1E90FF] hover:text-[#1E90FF] text-white rounded-none h-12 px-5 w-full sm:w-auto"
                  data-testid="success-dashboard-btn"
                >
                  Back to dashboard
                </Button>
              </Link>
              <Link to="/dashboard/key-stats">
                <Button
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-12 px-5 w-full sm:w-auto"
                  data-testid="success-keystats-btn"
                >
                  View all keys <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MentorLayout>
  );
}

const InfoRow = ({ icon: Icon, label, value, fullWidth = false }) => (
  <div className={`border border-white/10 px-4 py-3 flex items-center gap-3 ${fullWidth ? "sm:col-span-2" : ""}`}>
    <Icon className="w-4 h-4 text-[#1E90FF]" strokeWidth={1.5} />
    <div className="flex-1 min-w-0">
      <div className="text-[10px] tracking-[0.22em] uppercase text-white/45">{label}</div>
      <div className="font-mono text-sm text-white truncate">{value || "—"}</div>
    </div>
  </div>
);
