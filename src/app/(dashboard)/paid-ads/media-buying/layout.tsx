"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, Users, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SUB_TABS = [
  { href: "/paid-ads/media-buying", label: "Overview", icon: BarChart3 },
  { href: "/paid-ads/media-buying/campaigns", label: "Campaign Level", icon: LayoutGrid },
  { href: "/paid-ads/media-buying/ad-groups", label: "Ad Group Level", icon: Users },
  { href: "/paid-ads/media-buying/ads", label: "Ad Level", icon: ImageIcon },
];

export default function MediaBuyingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-5">
      <div className="border-b border-border">
        <nav className="flex items-center gap-1 -mb-px">
          {SUB_TABS.map((t) => {
            const active =
              t.href === "/paid-ads/media-buying"
                ? pathname === "/paid-ads/media-buying"
                : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
