"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "portfolio", label: "Portfolio", hint: "health by cohort" },
  { slug: "execution", label: "Execution", hint: "are we delivering" },
  { slug: "margin",    label: "Capacity & margin", hint: "where the hours go" },
  { slug: "risk",      label: "Risk", hint: "churn, three months early" },
];

export function AgencyTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-7 border-b border-o-hairline">
      {TABS.map((t) => {
        const href = `/agency/${t.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link key={t.slug} href={href}
            className={cn("relative pb-2.5 -mb-px",
              active ? "text-o-ink" : "text-o-ink-3 hover:text-o-ink")}>
            <span className={cn("block text-[length:var(--text-o-body)]", active && "font-medium")}>
              {t.label}
            </span>
            <span className="block text-[length:var(--text-o-label)] text-o-ink-3">{t.hint}</span>
            {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-o-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
