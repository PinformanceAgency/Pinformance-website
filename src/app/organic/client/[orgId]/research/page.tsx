/**
 * LIBRARY · Research — everything phases 1 to 3 produced, in one place.
 *
 * Not everything found in three months of research should steer a phase-4
 * decision on its own. The competitor exports, the intake prose, the
 * reasoning somebody typed against a red flag — those are context a person
 * needs at the moment they are choosing a board or briefing an image, and
 * the requirement is only that it exists and takes one look to find.
 *
 * What made that impossible before was not that the data was missing. It
 * was scattered across nine tables with no surface over it, and the
 * largest body of it — organic.task_answers, every answer and every piece
 * of reasoning from phases 1 to 3 — was written and never read back by
 * anything at all.
 */
import { notFound } from "next/navigation";
import { loadResearchRecord } from "@/lib/organic/research";
import { ResearchBrowser } from "./ResearchBrowser";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const record = await loadResearchRecord(orgId);
  if (!record) notFound();

  const counted =
    record.answers.length + record.notes.length + record.documents.length +
    record.grid.length + record.competitors.length + record.competitor_pins.length +
    record.market.length + record.clusters.length + record.board_opportunities.length;

  return (
    <div className="space-y-5">
      <header className="o-card px-6 py-5">
        <h1 className="o-h2 text-foreground">Research record</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Everything phases 1 to 3 produced for {record.name}, searchable in one place. Some of it
          drives phase 4 automatically — the grid sets the save/click split, the brand book
          constrains copy, what has won ranks the boards. The rest is here to be looked up at the
          moment you need it.
        </p>
        {counted === 0 && (
          <p className="mt-3 text-sm text-o-accent">
            Nothing recorded yet. This fills up as phases 1 to 3 are worked through.
          </p>
        )}
      </header>

      <ResearchBrowser record={record} />
    </div>
  );
}
