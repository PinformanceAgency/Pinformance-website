"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Save,
  Settings,
  Check,
  AlertCircle,
  RefreshCw,
  Unlink,
  Key,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrgSettings } from "@/lib/types";
import { DEFAULT_ORG_SETTINGS } from "@/lib/types";
import { OnboardingVideoModal } from "@/components/shared/onboarding-video-modal";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
];

interface ConnectionStatus {
  pinterest: { connected: boolean; expiresAt: string | null };
  krea: { connected: boolean };
  shopify: { connected: boolean; domain: string | null };
}

export default function SettingsPage() {
  const pathname = usePathname();
  const { org, loading } = useOrg();
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_ORG_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);

  // Integration state
  const [status, setStatus] = useState<ConnectionStatus>({
    pinterest: { connected: false, expiresAt: null },
    krea: { connected: false },
    shopify: { connected: false, domain: null },
  });
  const [kreaKey, setKreaKey] = useState("");
  const [updatingKrea, setUpdatingKrea] = useState(false);
  const [showKreaInput, setShowKreaInput] = useState(false);

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setSettings({ ...DEFAULT_ORG_SETTINGS, ...org.settings });

    setStatus({
      pinterest: {
        connected: !!org.pinterest_user_id,
        expiresAt: org.pinterest_token_expires_at,
      },
      krea: { connected: org.onboarding_step >= 6 },
      shopify: {
        connected: !!org.shopify_domain,
        domain: org.shopify_domain,
      },
    });
  }, [org]);

  async function handleSave() {
    if (!org) return;
    setSaving(true);

    const supabase = createClient();
    await supabase
      .from("organizations")
      .update({ name, settings })
      .eq("id", org.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateContentMix(
    key: "static" | "video" | "carousel",
    value: number
  ) {
    const others = Object.entries(settings.content_mix)
      .filter(([k]) => k !== key)
      .map(([, v]) => v);
    const remaining = 100 - value;
    const otherTotal = others.reduce((s, v) => s + v, 0);

    const newMix = { ...settings.content_mix, [key]: value };

    if (otherTotal > 0) {
      const otherKeys = (["static", "video", "carousel"] as const).filter(
        (k) => k !== key
      );
      otherKeys.forEach((k) => {
        newMix[k] = Math.round(
          (settings.content_mix[k] / otherTotal) * remaining
        );
      });
      const sum = Object.values(newMix).reduce((s, v) => s + v, 0);
      if (sum !== 100) {
        const firstOther = otherKeys[0];
        newMix[firstOther] += 100 - sum;
      }
    }

    setSettings({ ...settings, content_mix: newMix });
  }

  function toggleHour(hour: number) {
    const hours = settings.posting_hours.includes(hour)
      ? settings.posting_hours.filter((h) => h !== hour)
      : [...settings.posting_hours, hour].sort((a, b) => a - b);
    setSettings({ ...settings, posting_hours: hours });
  }

  async function handleDisconnectPinterest() {
    if (!org || !confirm("Disconnect your Pinterest account?")) return;
    const supabase = createClient();
    await supabase
      .from("organizations")
      .update({
        pinterest_user_id: null,
        pinterest_access_token_encrypted: null,
        pinterest_refresh_token_encrypted: null,
        pinterest_token_expires_at: null,
      })
      .eq("id", org.id);
    setStatus({
      ...status,
      pinterest: { connected: false, expiresAt: null },
    });
  }

  async function handleUpdateKrea() {
    if (!org || !kreaKey.trim()) return;
    setUpdatingKrea(true);

    await fetch("/api/shopify/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "krea", api_key: kreaKey.trim() }),
    });

    setKreaKey("");
    setShowKreaInput(false);
    setUpdatingKrea(false);
    setStatus({ ...status, krea: { connected: true } });
  }

  function handleReconnectShopify() {
    window.location.href = "/api/shopify/auth";
  }

  function handleReconnectPinterest() {
    window.location.href = "/api/pinterest/auth";
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your organization and posting preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 text-center px-4 py-2 rounded-md text-sm font-medium transition-colors",
              pathname === tab.href
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Organization */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4" /> Organization
        </h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold flex items-center gap-2">
          <Key className="w-4 h-4" /> Integrations
        </h2>

        {/* Shopify */}
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-sm">Shopify</h3>
                <p className="text-xs text-muted-foreground">
                  {status.shopify.connected
                    ? `Connected to ${status.shopify.domain}`
                    : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  status.shopify.connected
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {status.shopify.connected ? (
                  <>
                    <Check className="w-3 h-3" /> Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" /> Not connected
                  </>
                )}
              </span>
              <button
                onClick={handleReconnectShopify}
                className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80"
              >
                <RefreshCw className="w-3 h-3" /> Reconnect
              </button>
            </div>
          </div>
        </div>

        {/* Pinterest */}
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-sm">Pinterest</h3>
                <p className="text-xs text-muted-foreground">
                  {status.pinterest.connected
                    ? `Connected ${
                        status.pinterest.expiresAt
                          ? `· Expires ${new Date(
                              status.pinterest.expiresAt
                            ).toLocaleDateString()}`
                          : ""
                      }`
                    : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  status.pinterest.connected
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {status.pinterest.connected ? (
                  <>
                    <Check className="w-3 h-3" /> Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" /> Not connected
                  </>
                )}
              </span>
              {status.pinterest.connected ? (
                <button
                  onClick={handleDisconnectPinterest}
                  className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80 text-red-600"
                >
                  <Unlink className="w-3 h-3" /> Disconnect
                </button>
              ) : (
                <button
                  onClick={handleReconnectPinterest}
                  className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80"
                >
                  <RefreshCw className="w-3 h-3" /> Connect
                </button>
              )}
            </div>
          </div>
        </div>

        {/* kie.ai */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-medium text-sm">kie.ai</h3>
                <p className="text-xs text-muted-foreground">
                  {status.krea.connected
                    ? "API key configured"
                    : "Not configured"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                  status.krea.connected
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                )}
              >
                {status.krea.connected ? (
                  <>
                    <Check className="w-3 h-3" /> Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" /> Not connected
                  </>
                )}
              </span>
              <button
                onClick={() => setShowKreaInput(!showKreaInput)}
                className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80"
              >
                <RefreshCw className="w-3 h-3" /> Update
              </button>
            </div>
          </div>

          {showKreaInput && (
            <div className="flex gap-2">
              <input
                type="password"
                value={kreaKey}
                onChange={(e) => setKreaKey(e.target.value)}
                placeholder="Enter your kie.ai API key"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={handleUpdateKrea}
                disabled={updatingKrea || !kreaKey.trim()}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                {updatingKrea ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Posting settings */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold">Posting Settings</h2>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted-foreground">
              Pins per day
            </label>
            <span className="text-sm font-medium">{settings.pins_per_day}</span>
          </div>
          <input
            type="range"
            min={1}
            max={25}
            value={settings.pins_per_day}
            onChange={(e) =>
              setSettings({
                ...settings,
                pins_per_day: parseInt(e.target.value),
              })
            }
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>1</span>
            <span>25</span>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-1.5">
            Pinterest recommends 3-7 pins/day for optimal reach. New accounts should start with 3.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Auto-approve pins</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically approve generated pins without manual review
            </p>
          </div>
          <button
            onClick={() =>
              setSettings({
                ...settings,
                auto_approve: !settings.auto_approve,
              })
            }
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors",
              settings.auto_approve ? "bg-primary" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                settings.auto_approve ? "translate-x-5.5 left-0.5" : "left-0.5"
              )}
              style={{
                transform: settings.auto_approve
                  ? "translateX(22px)"
                  : "translateX(2px)",
              }}
            />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Timezone
          </label>
          <select
            value={settings.timezone}
            onChange={(e) =>
              setSettings({ ...settings, timezone: e.target.value })
            }
            className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content mix */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <h2 className="font-semibold">Content Mix</h2>

        {(["static", "video", "carousel"] as const).map((type) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground capitalize">
                {type}
              </label>
              <span className="text-sm font-medium">
                {settings.content_mix[type]}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.content_mix[type]}
              onChange={(e) => updateContentMix(type, parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        ))}

        <div className="flex gap-2">
          <div
            className="h-2 bg-primary rounded-l"
            style={{ width: `${settings.content_mix.static}%` }}
          />
          <div
            className="h-2 bg-blue-500"
            style={{ width: `${settings.content_mix.video}%` }}
          />
          <div
            className="h-2 bg-purple-500 rounded-r"
            style={{ width: `${settings.content_mix.carousel}%` }}
          />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-primary rounded-full" /> Static
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full" /> Video
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full" /> Carousel
          </span>
        </div>
      </div>

      {/* Posting hours */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Posting Hours</h2>
        <p className="text-xs text-muted-foreground">
          Select the hours when pins should be posted (in your timezone)
        </p>
        <div className="grid grid-cols-8 gap-2">
          {ALL_HOURS.map((hour) => (
            <button
              key={hour}
              onClick={() => toggleHour(hour)}
              className={cn(
                "px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                settings.posting_hours.includes(hour)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {hour.toString().padStart(2, "0")}:00
            </button>
          ))}
        </div>
      </div>

      {/* Onboarding Video — only if not watched */}
      {org && !org.onboarding_video_watched && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Play className="w-4 h-4" /> Onboarding Video
          </h2>
          <p className="text-sm text-muted-foreground">
            Haven&apos;t watched the onboarding video yet? Get a quick overview
            of everything Pinformance can do.
          </p>
          <button
            onClick={() => setShowVideoModal(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
          >
            <Play className="w-4 h-4" /> Watch Onboarding Video
          </button>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </button>

      {/* Onboarding Video Modal */}
      {showVideoModal && org && (
        <OnboardingVideoModal
          orgId={org.id}
          onClose={() => setShowVideoModal(false)}
          onComplete={() => {
            setShowVideoModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
