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
import { loadPauseState } from "@/lib/organic/phase4";
import { SettingsForm } from "./SettingsForm";
import { PublishingPause } from "@/components/organic/PublishingPause";
import { Band } from "@/components/organic/primitives";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [settings, pause] = await Promise.all([
    loadStoreSettings(orgId),
    loadPauseState(orgId),
  ]);
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

      {/* De pauze staat hier en niet tussen de velden: het is geen instelling
          die je invult maar een handeling met een datum, en hij vraagt een
          reden voordat hij iets doet. */}
      <Band
        title="Publishing"
        sub={
          "Stop everything going out for this store without losing the plan. Use it while you are " +
          "replacing creatives — scheduled pins are held, not cancelled, and they go out on their " +
          "own dates once you resume. A single cycle can also be paused on its own, from the cycle card."
        }
        className="mt-10"
      >
        <PublishingPause
          orgId={orgId}
          scope="store"
          pausedAt={pause.store_paused_at}
          reason={pause.store_pause_reason}
        />
        {pause.cycles_paused.length > 0 && (
          <p className="mt-3 text-[length:var(--text-o-label)] text-o-ink-3">
            Paused on its own right now:{" "}
            {pause.cycles_paused.map((c) => c.url_name).join(", ")}.
          </p>
        )}
      </Band>
    </div>
  );
}
