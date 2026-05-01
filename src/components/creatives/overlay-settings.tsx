"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Save, Upload, Image as ImageIcon, RotateCcw } from "lucide-react";

const ALL_STYLES = [
  { id: "hero-bottom", label: "Hero Bottom", desc: "Large headline at bottom over dark gradient" },
  { id: "editorial-top", label: "Editorial Top", desc: "Magazine-style headline at top" },
  { id: "minimal-bottom", label: "Minimal Bottom", desc: "Clean headline at bottom, no brand label" },
  { id: "accent-center", label: "Accent Center", desc: "Centred uppercase headline mid-image" },
  { id: "split-top", label: "Split Top", desc: "Cream warm tint with red brand label" },
  { id: "bold-bottom", label: "Bold Bottom", desc: "Strong large headline with red brand" },
  { id: "elegant-top", label: "Elegant Top", desc: "Refined headline at top, no caps" },
  { id: "dark-bar", label: "Dark Bar", desc: "Headline with dark bar background" },
];

type OverlayConfig = {
  rotation: { full_overlay: number; logo_only: number; clean: number };
  active_styles: string[];
  text_rules: { prefix: string; suffix: string; max_length: number; blocklist: string[] };
};

const DEFAULT_CONFIG: OverlayConfig = {
  rotation: { full_overlay: 3, logo_only: 1, clean: 1 },
  active_styles: ALL_STYLES.map((s) => s.id),
  text_rules: { prefix: "", suffix: "", max_length: 60, blocklist: [] },
};

export function OverlaySettings({ orgName }: { orgName: string | undefined }) {
  const [logoUrl, setLogoUrl] = useState("");
  const [defaultLinkUrl, setDefaultLinkUrl] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/brand-settings")
      .then((r) => r.json())
      .then((d) => {
        setLogoUrl(d.logo_url || "");
        setDefaultLinkUrl(d.default_link_url || "");
        setBrandVoice(d.brand_voice || "");
        if (d.overlay_config) {
          setConfig({
            rotation: d.overlay_config.rotation || DEFAULT_CONFIG.rotation,
            active_styles: d.overlay_config.active_styles || DEFAULT_CONFIG.active_styles,
            text_rules: d.overlay_config.text_rules || DEFAULT_CONFIG.text_rules,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/brand-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logo_url: logoUrl,
          overlay_config: config,
          brand_voice: brandVoice,
        }),
      });
      if (res.ok) setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "logo");
      const res = await fetch("/api/brand-settings/upload-logo", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        if (data.url) setLogoUrl(data.url);
      } else {
        alert("Upload failed: " + (await res.text()));
      }
    } finally {
      setUploading(false);
    }
  }

  function toggleStyle(id: string) {
    setConfig((c) => ({
      ...c,
      active_styles: c.active_styles.includes(id)
        ? c.active_styles.filter((s) => s !== id)
        : [...c.active_styles, id],
    }));
  }

  function setRotation(key: "full_overlay" | "logo_only" | "clean", val: number) {
    setConfig((c) => ({ ...c, rotation: { ...c.rotation, [key]: Math.max(0, val) } }));
  }

  function setTextRule<K extends keyof OverlayConfig["text_rules"]>(key: K, val: OverlayConfig["text_rules"][K]) {
    setConfig((c) => ({ ...c, text_rules: { ...c.text_rules, [key]: val } }));
  }

  function resetDefaults() {
    if (!confirm("Reset overlay settings to defaults? Logo and brand voice keep their values.")) return;
    setConfig(DEFAULT_CONFIG);
  }

  if (loading) return <div className="h-96 bg-muted animate-pulse rounded-xl" />;

  const totalRotation = config.rotation.full_overlay + config.rotation.logo_only + config.rotation.clean;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Creative settings</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Logo, overlay rules, branding style and SEO defaults for {orgName || "this brand"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetDefaults}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : savedAt && Date.now() - savedAt < 3000 ? "Saved ✓" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Brand logo</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            Used in overlays. PNG with transparent background works best.
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="w-24 h-24 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
            ) : (
              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://... (logo URL)"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
            <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm cursor-pointer hover:bg-muted">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Uploading…" : "Upload new logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Variant rotation */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Variant rotation</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            For every {totalRotation || "5"} statics uploaded, this distribution is applied.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <RotationField label="Full overlay + logo" value={config.rotation.full_overlay} onChange={(v) => setRotation("full_overlay", v)} color="bg-blue-100 text-blue-700" desc="Headline + brand label + logo" />
          <RotationField label="Logo only" value={config.rotation.logo_only} onChange={(v) => setRotation("logo_only", v)} color="bg-purple-100 text-purple-700" desc="Just the logo, no text" />
          <RotationField label="Clean" value={config.rotation.clean} onChange={(v) => setRotation("clean", v)} color="bg-green-100 text-green-700" desc="Original creative untouched" />
        </div>
      </div>

      {/* Active styles */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Active overlay styles</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            Which layouts are picked for full-overlay statics. Disabled styles will never be used.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ALL_STYLES.map((s) => {
            const active = config.active_styles.includes(s.id);
            return (
              <label key={s.id} className={cn("flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors", active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50")}>
                <input type="checkbox" checked={active} onChange={() => toggleStyle(s.id)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
        {config.active_styles.length === 0 && <div className="text-xs text-red-600">⚠ At least 1 style must be active.</div>}
      </div>

      {/* Text rules */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Overlay text rules</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            Headlines are AI-generated per pin. These rules wrap or constrain the result.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Prefix</label>
            <input type="text" value={config.text_rules.prefix} onChange={(e) => setTextRule("prefix", e.target.value)} placeholder="e.g. ✨ " className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Suffix</label>
            <input type="text" value={config.text_rules.suffix} onChange={(e) => setTextRule("suffix", e.target.value)} placeholder="e.g.  →" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Max headline length</label>
            <input type="number" min={20} max={120} value={config.text_rules.max_length} onChange={(e) => setTextRule("max_length", parseInt(e.target.value) || 60)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Blocklist (comma-separated)</label>
            <input type="text" value={config.text_rules.blocklist.join(", ")} onChange={(e) => setTextRule("blocklist", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="e.g. cheap, fake, basic" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Preview: <span className="font-mono px-2 py-0.5 bg-muted rounded">{config.text_rules.prefix}{"AI-generated headline"}{config.text_rules.suffix}</span>
        </div>
      </div>

      {/* SEO / Brand voice */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">SEO &amp; brand voice</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            How AI writes pin titles, descriptions and keywords for this brand.
          </p>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Brand voice</label>
          <textarea
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            rows={3}
            placeholder="e.g. Empowering, supportive, body-positive. Speaks to women who struggle with fit."
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Default link URL (fallback)</label>
          <input
            type="url"
            value={defaultLinkUrl}
            disabled
            className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground"
            placeholder="(set via Settings → General)"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Used when no per-pin URL is matched. Edit in Settings → General.
          </p>
        </div>
      </div>
    </div>
  );
}

function RotationField({ label, value, onChange, color, desc }: { label: string; value: number; onChange: (v: number) => void; color: string; desc: string; }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-medium mb-2", color)}>{label}</div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(value - 1)} className="w-7 h-7 rounded border border-border hover:bg-muted text-sm">–</button>
        <input type="number" min={0} value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)} className="w-12 text-center px-2 py-1 bg-background border border-border rounded-lg text-sm" />
        <button onClick={() => onChange(value + 1)} className="w-7 h-7 rounded border border-border hover:bg-muted text-sm">+</button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">{desc}</div>
    </div>
  );
}
