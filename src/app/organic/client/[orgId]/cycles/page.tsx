import { loadPhase4Snapshot, loadCyclesForOrg, loadOrgBoards, loadOrgKeywordsWithVolume } from "@/lib/organic/phase4";
import { Phase4Cycles } from "../Phase4Cycles";

export const dynamic = "force-dynamic";

export default async function CyclesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [phase4, cycles, orgBoards, orgKeywords] = await Promise.all([
    loadPhase4Snapshot(orgId),
    loadCyclesForOrg(orgId),
    loadOrgBoards(orgId),
    loadOrgKeywordsWithVolume(orgId),
  ]);
  return (
    <Phase4Cycles
      orgId={orgId}
      cycles={cycles}
      selectableUrls={phase4.selectable_urls as Parameters<typeof Phase4Cycles>[0]["selectableUrls"]}
      orgBoards={orgBoards}
      orgKeywords={orgKeywords}
    />
  );
}
