import { notFound } from "next/navigation";
import { loadClientHeader } from "@/lib/organic/queries";
import * as P5 from "@/lib/organic/phase5";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { InternalAnalytics } from "@/components/organic/InternalAnalytics";
import { loadStoreCost, loadCycleEfficiency, loadDraftEditStats, loadCacheContribution } from "@/lib/organic/internal-analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params, searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const to = sp.to ?? new Date().toISOString().slice(0, 10);
  const from = sp.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [header, pinterest, baseline, byReason, byKeyword, byBreadth, ads, setup,
         cost, cycleEff, drafts, cache] = await Promise.all([
    loadClientHeader(orgId),
    P5.fetchOrganicAnalytics(orgId, from, to),
    P5.loadBaseline(orgId),
    P5.byReason(orgId, from, to),
    P5.byKeyword(orgId, from, to),
    P5.byBoardBreadth(orgId, from, to),
    P5.surfaceAdsCandidates(orgId, from, to, 5),
    P5.loadSetupState(orgId, from, to),
    loadStoreCost(orgId),
    loadCycleEfficiency(orgId),
    loadDraftEditStats(orgId),
    loadCacheContribution(orgId),
  ]);
  if (!header) notFound();

  const deltas = P5.computeDeltas(baseline, pinterest.totals, setup);

  return (
    <div>
      <AnalyticsPanel
        orgId={orgId} from={from} to={to}
        pinterest={pinterest}
        baseline={baseline}
        deltas={deltas}
        byReason={byReason}
        byKeyword={byKeyword}
        byBreadth={byBreadth}
        adsCandidates={ads}
      />
      <div className="mt-10 pt-8 border-t border-o-hairline-firm">
        <p className="text-[length:var(--text-o-label)] uppercase tracking-[0.08em] text-o-ink-3 font-medium mb-5">
          Internal only — not on the client report
        </p>
        <InternalAnalytics cost={cost} cycles={cycleEff} drafts={drafts} cache={cache} />
      </div>
    </div>
  );
}
