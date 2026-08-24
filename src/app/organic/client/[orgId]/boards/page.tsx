/**
 * LIBRARY · Boards — internal working surface.
 *
 * The coverage matrix leads, not the board list. A topic under five boards
 * cannot enter phase 4, so this is the screen that predicts a production
 * blockage roughly a fortnight before anyone hits it. The list underneath
 * is reference; the matrix is the reason to open the page.
 */
import { loadBoards } from "@/lib/organic/workspace";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar, CoverageMatrix } from "@/components/organic/internal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// PROTECTED is the normal resting state for a board we manage, so it stays
// quiet. Reserving the accent for it would put brand red on every row of
// every healthy store, which is precisely how an accent stops meaning
// anything.
const STATUS_TONE: Record<string, "good" | "warn" | "accent" | "neutral"> = {
  PUBLIC: "good", PROTECTED: "neutral", SECRET: "neutral", PLANNED: "warn",
};

export default async function BoardsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { boards, coverage } = await loadBoards(orgId);

  const live = boards.filter((b) => b.status !== "PLANNED");
  const short = live.filter((b) => b.pin_count < 10).length;
  const uncovered = coverage.filter((c) => !c.is_covered).length;
  const dormant = live.filter((b) => !b.last_pin_scheduled_date).length;

  return (
    <div>
      <Toolbar>
        <Metric label="Boards live" value={live.length} />
        <Metric label="Under 10 pins" value={short} tone={short ? "bad" : "good"} />
        <Metric label="Topics short" value={uncovered} tone={uncovered ? "bad" : "good"} />
        <Metric label="No pins scheduled" value={dormant} tone={dormant ? "warn" : "good"} />
      </Toolbar>

      <Band title="Topic coverage"
            sub="Every topic needs five active boards before phase 4 can select a URL under it.">
        <Panel className="px-5 py-5">
          <CoverageMatrix rows={coverage} threshold={5} />
        </Panel>
      </Band>

      <Band title="Boards" sub={`${boards.length} in the library.`}>
        {boards.length === 0 ? (
          <Empty
            headline="No boards yet."
            body="Board architecture is designed in phase 3 — topics first, then five boards per topic, then seeding. Boards already on the Pinterest account are imported during onboarding and show here as migrated."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Board</TH>
                <TH>Topic</TH>
                <TH>Status</TH>
                <TH align="right">Pins</TH>
                <TH>Last pin</TH>
                <TH align="right">URLs on board</TH>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => {
                const underSeeded = b.pin_count < 10 && b.status !== "PLANNED";
                return (
                  <tr key={b.id} className="hover:bg-o-sunk/50">
                    <TD>
                      <span className="block text-o-ink truncate max-w-[19rem]" title={b.name}>{b.name}</span>
                      {b.primary_keyword && (
                        <span className="block text-[length:var(--text-o-label)] text-o-ink-3 truncate max-w-[19rem]">
                          {b.primary_keyword}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {b.topic_name ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="truncate max-w-[10rem]">{b.topic_name}</span>
                          {!b.topic_covered && <Pill tone="bad">short</Pill>}
                        </span>
                      ) : <span className="text-o-ink-3">—</span>}
                    </TD>
                    <TD><Pill tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status.toLowerCase()}</Pill></TD>
                    <TD align="right">
                      <span className={cn(underSeeded && "text-o-neg font-semibold")}>{b.pin_count}</span>
                    </TD>
                    <TD muted={!b.last_pin_scheduled_date}>
                      {b.last_pin_scheduled_date ?? "—"}
                    </TD>
                    <TD align="right">
                      <span title={b.urls_pinned_names.join(", ")}>{b.urls_pinned_count}</span>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Band>
    </div>
  );
}
