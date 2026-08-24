/**
 * Store settings.
 *
 * Everything on this page changes how another screen reads: onboarded_date
 * sets the cohort every portfolio comparison uses, the retainer decides
 * whether margin can be computed at all, and the daily target is what
 * agency execution measures delivery against. Each field says so where it
 * is not obvious.
 */
import { notFound } from "next/navigation";
import { loadStoreSettings } from "@/lib/organic/workspace";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const settings = await loadStoreSettings(orgId);
  if (!settings) notFound();

  return (
    <div>
      <header className="mb-7">
        <h1 className="o-display text-[length:var(--text-o-figure-md)] font-semibold text-o-ink leading-snug">
          Settings
        </h1>
        <p className="mt-1.5 text-[length:var(--text-o-body)] text-o-ink-2 max-w-[44rem] leading-relaxed">
          These values drive the rest of the app — cohort placement, margin, and what
          delivery is measured against. Blank is a real state everywhere: it means
          not recorded, never zero.
        </p>
      </header>
      <SettingsForm initial={settings} />
    </div>
  );
}
