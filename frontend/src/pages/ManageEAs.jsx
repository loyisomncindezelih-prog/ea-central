import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MentorLayout from "@/components/MentorLayout";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Cpu, ArrowRight, Plus } from "lucide-react";

const EA_LIMIT = 3;

export default function ManageEAs() {
  const [eas, setEas] = useState([]);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => api.get("/mentor/eas").then((r) => setEas(r.data)).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!confirm) {
      toast.error("Please confirm before adding.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/mentor/eas", { name });
      toast.success("EA added");
      setName("");
      setConfirm(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const atLimit = eas.length >= EA_LIMIT;

  return (
    <MentorLayout>
      <div data-testid="manage-eas-page" className="ea-mobile">
        <div className="flex items-end justify-between mb-6 ea-card-enter">
          <div>
            <div className="text-[10px] sm:text-xs tracking-[0.32em] uppercase text-[#1E90FF]">/ manage</div>
            <h1 className="ea-mobile-display text-3xl md:text-4xl text-white leading-[1.05] mt-2">
              Expert <span className="text-[#1E90FF]">Advisors</span>.
            </h1>
          </div>
          <span className="ea-card rounded-full px-3 py-1.5 text-xs tracking-[0.22em] uppercase text-[#1E90FF] font-semibold" data-testid="ea-count">
            {eas.length}/{EA_LIMIT} EAs
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* New EA form */}
          <div className="ea-card-elevated rounded-2xl p-6 lg:col-span-2 ea-card-enter" style={{ animationDelay: "0.05s" }} data-testid="new-ea-card">
            <div className="text-[10px] tracking-[0.28em] uppercase text-[#1E90FF] mb-2">/ new ea</div>
            <h2 className="ea-mobile-display text-xl text-white">Add a new EA</h2>
            <p className="text-xs text-white/55 mt-1.5">
              Add a new Expert Advisor to licence ({eas.length}/{EA_LIMIT}).
            </p>

            <form onSubmit={add} className="mt-5 space-y-4" data-testid="new-ea-form">
              <div>
                <Label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 block">EA name</Label>
                <Input
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full EA name including version"
                  disabled={atLimit}
                  className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 px-4 disabled:opacity-50"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                  data-testid="new-ea-name"
                />
              </div>
              <label className="flex items-start gap-3 ea-card rounded-xl p-3 cursor-pointer ea-tap-soft">
                <Checkbox
                  checked={confirm}
                  onCheckedChange={(v) => setConfirm(Boolean(v))}
                  disabled={atLimit}
                  className="mt-0.5 border-white/30 data-[state=checked]:bg-[#1E90FF] data-[state=checked]:border-[#1E90FF] data-[state=checked]:text-black"
                  data-testid="new-ea-confirm"
                />
                <span className="text-xs text-white/70 leading-relaxed">
                  I confirm I am the owner/admin of this EA.
                </span>
              </label>

              {atLimit && (
                <div className="ea-card rounded-xl text-xs text-white/65 px-3 py-2.5" data-testid="new-ea-limit">
                  Limit reached. Delete one to free a slot.
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={loading || atLimit}
                  className="text-black font-bold rounded-xl h-11 px-5 ea-tap disabled:opacity-50"
                  style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 18px rgba(30,144,255,0.55)" }}
                  data-testid="new-ea-submit"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {loading ? "Adding…" : "Add EA"}
                </Button>
                <Button
                  type="button"
                  onClick={() => { setName(""); setConfirm(false); }}
                  className="bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-11 px-5 ea-tap text-xs font-semibold tracking-[0.18em] uppercase"
                  data-testid="new-ea-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>

          {/* List */}
          <div className="ea-card-elevated rounded-2xl p-6 lg:col-span-3 ea-card-enter" style={{ animationDelay: "0.10s" }} data-testid="ea-list-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.28em] uppercase text-[#1E90FF] mb-2">/ your eas</div>
                <h2 className="ea-mobile-display text-xl text-white">Your Expert Advisors</h2>
                <p className="text-xs text-white/55 mt-1.5">All EAs registered under your account</p>
              </div>
              <span className="text-xs tracking-[0.22em] uppercase text-white/45 ea-mono">{eas.length}/{EA_LIMIT}</span>
            </div>

            <div className="mt-5">
              <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] tracking-[0.28em] uppercase text-white/35 border-b border-white/[0.05] pb-2.5">
                <div className="col-span-5">EA</div>
                <div className="col-span-2">Users</div>
                <div className="col-span-2">Active</div>
                <div className="col-span-3 text-right">Action</div>
              </div>
              {eas.length === 0 && (
                <div className="text-sm text-white/45 py-10 text-center" data-testid="ea-list-empty">
                  No EAs yet. Add one on the left to get started.
                </div>
              )}
              {eas.map((ea) => (
                <div
                  key={ea.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-2 py-4 border-b border-white/[0.05] hover:bg-white/[0.02] transition items-center"
                  data-testid={`ea-row-${ea.id}`}
                >
                  <div className="md:col-span-5">
                    <div className="ea-mobile-display font-bold text-[#1E90FF] flex items-center gap-2 text-base">
                      <Cpu className="w-4 h-4" strokeWidth={1.8} />
                      {ea.name}
                    </div>
                    <div className="text-[10px] tracking-[0.22em] uppercase text-white/35 mt-1">
                      created {new Date(ea.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="md:col-span-2 ea-mono text-white">{ea.users}</div>
                  <div className="md:col-span-2 ea-mono text-[#10B981] font-semibold">{ea.active}</div>
                  <div className="md:col-span-3 md:text-right">
                    <Link to={`/dashboard/manage-eas/${ea.id}`}>
                      <Button
                        className="bg-transparent ea-card hover:bg-white/[0.04] text-white rounded-xl h-9 px-4 text-xs font-semibold tracking-[0.18em] uppercase ea-tap"
                        data-testid={`ea-view-${ea.id}`}
                      >
                        Manage <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MentorLayout>
  );
}
