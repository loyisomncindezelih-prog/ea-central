import { useRef, useState } from "react";
import MentorLayout from "@/components/MentorLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { toast } from "sonner";
import { User, Camera, Trash2, Save, Lock, Mail, Phone } from "lucide-react";

const ROBOT_IMG =
  "https://customer-assets.emergentagent.com/job_copy-trading-hub-2/artifacts/ukmwnbqz_ChatGPT%20Image%20May%2013%2C%202026%2C%2009_34_45%20PM.png";

// Resize+compress image client-side to keep payload small (~150 KB)
async function fileToCompressedDataUrl(file, max = 384) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const ratio = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    username: "",
    country_code: "+27",
    contact_number: "",
  });
  const [preview, setPreview] = useState(null); // pending new image (data URL)
  const [busy, setBusy] = useState(false);

  // Sync form state with `user` context using the React-docs-recommended
  // "reset state during render with a key" pattern. Avoids setState-in-effect
  // and is safe for React 19 strict mode.
  const userKey = user?.id || "";
  const [syncedFor, setSyncedFor] = useState("");
  if (user && userKey !== syncedFor) {
    setSyncedFor(userKey);
    setForm({
      username: user.username || "",
      country_code: user.country_code || "+27",
      contact_number: user.contact_number || "",
    });
    setPreview(null);
  }

  const currentAvatar = preview ?? user?.profile_image ?? null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    try {
      const compressed = await fileToCompressedDataUrl(file, 384);
      setPreview(compressed);
    } catch (err) {
      toast.error("Could not read image: " + err.message);
    } finally {
      e.target.value = ""; // allow re-pick same file
    }
  };

  const removeImage = () => {
    setPreview("");  // empty string → tell backend to clear
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        username: form.username.trim(),
        country_code: form.country_code.trim(),
        contact_number: form.contact_number.trim(),
      };
      if (preview !== null) payload.profile_image = preview; // "" clears; otherwise base64
      await updateProfile(payload);
      toast.success("Profile updated");
      setPreview(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MentorLayout>
      <div data-testid="profile-page" className="ea-mobile">
        <div className="ea-card-enter">
          <div className="text-[10px] sm:text-xs tracking-[0.32em] uppercase text-[#1E90FF]">/ profile</div>
          <h1 className="ea-mobile-display text-3xl md:text-4xl text-white leading-[1.05] mt-2">
            Your <span className="text-[#1E90FF]">profile</span>.
          </h1>
          <p className="text-white/55 text-sm mt-2.5 max-w-xl leading-relaxed">
            Update your info and EA logo. The image you upload becomes your EA&apos;s logo for clients on the Mobile EA.
          </p>
        </div>

        <form onSubmit={save} className="ea-card-elevated rounded-2xl mt-7 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 ea-card-enter" style={{ animationDelay: "0.05s" }}>
          {/* Avatar column */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ width: 176, height: 176 }}>
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: "conic-gradient(from 0deg, #1E90FF66, transparent 40%, #1E90FF33, transparent 80%, #1E90FF66)", filter: "blur(2px)" }}
              />
              <div className="absolute inset-[6px] rounded-full overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "#09090B" }} data-testid="profile-avatar-preview">
                {currentAvatar ? (
                  <img src={currentAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <img src={ROBOT_IMG} alt="" className="w-full h-full object-cover" style={{ objectPosition: "50% 32%", transform: "scale(1.6)", transformOrigin: "50% 32%" }} />
                )}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="profile-file-input" />
            <div className="flex gap-2 w-full">
              <Button type="button" onClick={() => fileRef.current?.click()} className="flex-1 text-black font-bold rounded-xl h-10 text-xs tracking-[0.2em] uppercase ea-tap" style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 18px rgba(30,144,255,0.55)" }} data-testid="profile-upload-btn">
                <Camera className="w-4 h-4 mr-2" /> {currentAvatar ? "Change" : "Upload"}
              </Button>
              {(user?.profile_image || preview) && (
                <Button type="button" onClick={removeImage} className="bg-transparent ea-card hover:bg-[#EF4444]/10 hover:text-[#EF4444] text-white rounded-xl h-10 px-3 ea-tap" data-testid="profile-remove-btn" title="Use default">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-[10px] tracking-[0.22em] uppercase text-white/40 text-center mt-1">
              JPG or PNG · auto-resized
            </p>
          </div>

          {/* Form column */}
          <div className="space-y-5">
            <FieldBlock label="Email" icon={Mail} locked>
              <div className="flex items-center gap-2 ea-card rounded-xl px-3 h-12 text-white/55" data-testid="profile-email-readonly">
                <span className="flex-1 truncate ea-mono text-sm">{user?.email || ""}</span>
                <Lock className="w-3.5 h-3.5 text-white/35" />
              </div>
              <p className="text-[10px] tracking-[0.22em] uppercase text-white/35 mt-1">Email cannot be changed.</p>
            </FieldBlock>

            <FieldBlock label="Username" icon={User}>
              <Input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Your display name"
                className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 px-4"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
                data-testid="profile-username"
              />
            </FieldBlock>

            <div className="grid grid-cols-[120px_1fr] gap-3">
              <FieldBlock label="Country code">
                <Input
                  required
                  value={form.country_code}
                  onChange={(e) => setForm({ ...form, country_code: e.target.value })}
                  placeholder="+27"
                  className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 ea-mono px-3"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                  data-testid="profile-country-code"
                />
              </FieldBlock>
              <FieldBlock label="Contact number" icon={Phone}>
                <Input
                  required
                  value={form.contact_number}
                  onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
                  placeholder="763280102"
                  className="bg-[#121214] border border-white/8 focus-visible:ring-0 focus-visible:ring-offset-0 text-white rounded-xl h-12 ea-mono px-3"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                  data-testid="profile-contact"
                />
              </FieldBlock>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={busy} className="text-black font-bold rounded-xl h-12 px-6 tracking-wide ea-tap" style={{ backgroundColor: "#1E90FF", boxShadow: "0 6px 18px rgba(30,144,255,0.55)" }} data-testid="profile-save-btn">
                <Save className="w-4 h-4 mr-2" /> {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </MentorLayout>
  );
}

const FieldBlock = ({ label, icon: Icon, children, locked }) => (
  <div>
    <Label className="text-[10px] tracking-[0.28em] uppercase text-white/40 mb-1.5 flex items-center gap-2">
      {Icon && <Icon className="w-3 h-3 text-[#1E90FF]" />}
      {label}
      {locked && <span className="text-[9px] text-white/30">(read-only)</span>}
    </Label>
    {children}
  </div>
);
