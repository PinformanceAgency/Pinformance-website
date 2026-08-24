import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader } from "@/lib/organic/queries";
import * as P5 from "@/lib/organic/phase5";
import { AnalyticsPanel } from "./AnalyticsPanel";

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

  const [header, pinterest, baseline, byReason, byKeyword, byBreadth, ads, setup] = await Promise.all([
    loadClientHeader(orgId),
    P5.fetchOrganicAnalytics(orgId, from, to),
    P5.loadBaseline(orgId),
    P5.byReason(orgId, from, to),
    P5.byKeyword(orgId, from, to),
    P5.byBoardBreadth(orgId, from, to),
    P5.surfaceAdsCandidates(orgId, from, to, 5),
    P5.loadSetupState(orgId, from, to),
  ]);
  if (!header) notFound();

  const deltas = P5.computeDeltas(baseline, pinterest.totals, setup);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/client/${orgId}`} className="text-xs text-neutral-500 hover:text-neutral-900">
          ← Back to {header.name}
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold">Analytics — {header.name}</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Organic KPIs vs the P1.2.13 baseline · feedback loop back to reason / keyword / board · ads winners.
        </p>
      </div>
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
    </div>
  );
}
