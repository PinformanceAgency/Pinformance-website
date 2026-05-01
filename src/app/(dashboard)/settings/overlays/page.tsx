"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import { Save, Upload, Image as ImageIcon, RotateCcw } from "lucide-react";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
  { href: "/settings/overlays", label: "Statics & Overlays" },
];

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

export default function OverlaysSettingsPage() {
  const pathname = usePathname();
  const { org, loading: orgLoading } = useOrg();
  const [logoUrl, setLogoUrl] = useState("");
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!org) return;
    fetch("/api/brand-settings")
      .then((r) => r.json())
      .then((d) => {
        setLogoUrl(d.logo_url || "");
        if (d.overlay_config) {
          setConfig({
            rotation: d.overlay_config.rotation || DEFAULT_CONFIG.rotation,
            active_styles: d.overlay_config.active_styles || DEFAULT_CONFIG.active_styles,
            text_rules: d.overlay_config.text_rules || DEFAULT_CONFIG.text_rules,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [org?.id]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/brand-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: logoUrl, overlay_config: config }),
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
    if (!confirm("Reset all overlay settings to defaults?")) return;
    setConfig(DEFAULT_CONFIG);
  }

  if (orgLoading || loading) return <div className="h-96 bg-muted animate-pulse rounded-xl" />;

  const totalRotation = config.rotation.full_overlay + config.rotation.logo_only + config.rotation.clean;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-border flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              pathname === t.href
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Statics & Overlays</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure overlay variables for {org?.name || "this brand"} — logo, text rules, rotation and active styles.
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

      {/* SECTION 1: Logo */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Brand logo</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Used in the bottom-right of full-overlay statics and on logo-only statics. PNG with transparent background works best.
          </p>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-32 h-32 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden flex-shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
            ) : (
              <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Logo URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm cursor-pointer hover:bg-muted">
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
      </div>

      {/* SECTION 2: Variant rotation */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Variant rotation</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            For every {totalRotation || "5"} statics uploaded, this is how they get distributed.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <RotationField
            label="Full overlay + logo"
            value={config.rotation.full_overlay}
            onChange={(v) => setRotation("full_overlay", v)}
            color="bg-blue-100 text-blue-700"
            desc="Headline + brand label + logo"
          />
          <RotationField
            label="Logo only"
            value={config.rotation.logo_only}
            onChange={(v) => setRotation("logo_only", v)}
            color="bg-purple-100 text-purple-700"
            desc="Just the logo, no text"
          />
          <RotationField
            label="Clean"
            value={config.rotation.clean}
            onChange={(v) => setRotation("clean", v)}
            color="bg-green-100 text-green-700"
            desc="Original creative untouched"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          Total per cycle: {totalRotation} (default 3 + 1 + 1 = 5)
        </div>
      </div>

      {/* SECTION 3: Active styles */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Active overlay styles</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Pick which layouts get used for full-overlay statics. Disabled styles will never be selected.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ALL_STYLES.map((s) => {
            const active = config.active_styles.includes(s.id);
            return (
              <label
                key={s.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/50"
                )}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleStyle(s.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        {config.active_styles.length === 0 && (
          <div className="text-xs text-red-600">⚠ At least 1 style must be active.</div>
        )}
      </div>

      {/* SECTION 4: Text rules */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Overlay text rules</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            The overlay headline is auto-generated by AI per pin. Use these rules to wrap or constrain it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Prefix</label>
            <input
              type="text"
              value={config.text_rules.prefix}
              onChange={(e) => setTextRule("prefix", e.target.value)}
              placeholder="e.g. ✨ "
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Suffix</label>
            <input
              type="text"
              value={config.text_rules.suffix}
              onChange={(e) => setTextRule("suffix", e.target.value)}
              placeholder="e.g.  →"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Max headline length</label>
            <input
              type="number"
              min={20}
              max={120}
              value={config.text_rules.max_length}
              onChange={(e) => setTextRule("max_length", parseInt(e.target.value) || 60)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Blocklist (comma-separated)</label>
            <input
              type="text"
              value={config.text_rules.blocklist.join(", ")}
              onChange={(e) =>
                setTextRule(
                  "blocklist",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                )
              }
              placeholder="e.g. cheap, fake, basic"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Preview: <span className="font-mono px-2 py-0.5 bg-muted rounded">
            {config.text_rules.prefix}{"AI-generated headline"}{config.text_rules.suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

function RotationField({
  label,
  value,
  onChange,
  color,
  desc,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
  desc: string;
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-medium mb-2", color)}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(value - 1)}
          className="w-7 h-7 rounded border border-border hover:bg-muted text-sm"
        >
          –
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="w-14 text-center px-2 py-1 bg-background border border-border rounded-lg text-sm"
        />
        <button
          onClick={() => onChange(value + 1)}
          className="w-7 h-7 rounded border border-border hover:bg-muted text-sm"
        >
          +
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">{desc}</div>
    </div>
  );
}
