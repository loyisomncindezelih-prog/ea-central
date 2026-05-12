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
      <div data-testid="manage-eas-page">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF]">/ manage</div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mt-2">
              Expert <span className="text-[#1E90FF]">Advisors</span>.
            </h1>
          </div>
          <span className="ea-glass px-3 py-1.5 text-xs tracking-[0.22em] uppercase text-[#1E90FF]" data-testid="ea-count">
            {eas.length}/{EA_LIMIT} EAs
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* New EA form */}
          <div className="ea-glass p-6 lg:col-span-2" data-testid="new-ea-card">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#1E90FF] mb-2">/ new ea</div>
            <h2 className="font-display text-xl font-semibold">Add a new EA</h2>
            <p className="text-xs text-white/55 mt-1">
              Add a new Expert Advisor to licence ({eas.length}/{EA_LIMIT}).
            </p>

            <form onSubmit={add} className="mt-5 space-y-5" data-testid="new-ea-form">
              <div>
                <Label className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 block">EA name</Label>
                <Input
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full EA name including version"
                  disabled={atLimit}
                  className="bg-transparent border-white/20 focus:border-[#1E90FF] focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-none h-12 disabled:opacity-50"
                  data-testid="new-ea-name"
                />
              </div>
              <label className="flex items-start gap-3 border border-white/15 p-3 cursor-pointer">
                <Checkbox
                  checked={confirm}
                  onCheckedChange={(v) => setConfirm(Boolean(v))}
                  disabled={atLimit}
                  className="mt-0.5 border-white/30 data-[state=checked]:bg-[#1E90FF] data-[state=checked]:border-[#1E90FF] data-[state=checked]:text-black"
                  data-testid="new-ea-confirm"
                />
                <span className="text-xs text-white/70">
                  I confirm I am the owner/admin of this EA.
                </span>
              </label>

              {atLimit && (
                <div className="border border-white/15 bg-white/5 text-xs text-white/65 px-3 py-2" data-testid="new-ea-limit">
                  Limit reached. Delete one to free a slot.
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={loading || atLimit}
                  className="bg-[#1E90FF] hover:bg-[#2A8BFF] text-black font-bold rounded-none h-11 px-5 disabled:opacity-50"
                  data-testid="new-ea-submit"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {loading ? "Adding…" : "Add EA"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setName(""); setConfirm(false); }}
                  className="border border-white/20 hover:border-white/40 text-white rounded-none h-11 px-5"
                  data-testid="new-ea-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>

          {/* List */}
          <div className="ea-glass p-6 lg:col-span-3" data-testid="ea-list-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#1E90FF] mb-2">/ your eas</div>
                <h2 className="font-display text-xl font-semibold">Your Expert Advisors</h2>
                <p className="text-xs text-white/55 mt-1">All EAs registered under your account</p>
              </div>
              <span className="text-xs tracking-[0.22em] uppercase text-white/45">{eas.length}/{EA_LIMIT}</span>
            </div>

            <div className="mt-5">
              <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] tracking-[0.25em] uppercase text-white/40 border-b border-white/10 pb-2">
                <div className="col-span-5">EA</div>
                <div className="col-span-2">Users</div>
                <div className="col-span-2">Active</div>
                <div className="col-span-3 text-right">Action</div>
              </div>
              {eas.length === 0 && (
                <div className="text-sm text-white/45 py-8 text-center" data-testid="ea-list-empty">
                  No EAs yet. Add one on the left to get started.
                </div>
              )}
              {eas.map((ea) => (
                <div
                  key={ea.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-2 py-4 border-b border-white/5 hover:bg-white/[0.02] transition items-center"
                  data-testid={`ea-row-${ea.id}`}
                >
                  <div className="md:col-span-5">
                    <div className="font-display font-semibold text-[#1E90FF] flex items-center gap-2">
                      <Cpu className="w-4 h-4" strokeWidth={1.5} />
                      {ea.name}
                    </div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-white/35 mt-1">
                      created {new Date(ea.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="md:col-span-2 font-mono">{ea.users}</div>
                  <div className="md:col-span-2 font-mono text-[#1E90FF]">{ea.active}</div>
                  <div className="md:col-span-3 md:text-right">
                    <Link to={`/dashboard/manage-eas/${ea.id}`}>
                      <Button
                        className="bg-transparent border border-[#1E90FF]/40 text-[#1E90FF] hover:bg-[#1E90FF]/10 rounded-none h-9 px-4 text-xs tracking-wide"
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
