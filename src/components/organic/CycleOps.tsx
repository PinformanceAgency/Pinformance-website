/**
 * CYCLES · the operational surface of phase 4.
 *
 * Answers, in this order, the three questions a manager has about a
 * running waterfall:
 *
 *   What breaks today?   failures, first and loudest
 *   What ships today?    today's queue
 *   Is the plan intact?  the fortnight calendar and the design x board matrix
 *
 * Failures lead deliberately. A failed pin is not a slower success — it is
 * a decision waiting to be made, and burying it under a queue of healthy
 * rows is how a dead token goes unnoticed for a week.
 */
import type { CycleOps } from "@/lib/organic/workspace";
import { Band, Panel, Empty } from "./primitives";
import { Table, TH, TD, Pill, Metric, Toolbar } from "./internal";
import { DATA_COLORS } from "./charts";
import { cn } from "@/lib/utils";

const PIN_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  PUBLISHED: "good", SCHEDULED: "neutral", PLANNED: "neutral", FAILED: "bad",
};

export function CycleOpsPanel({ ops, today }: { ops: CycleOps; today: string }) {
  const nothingRunning =
    ops.today.length === 0 && ops.failures.length === 0 && ops.matrix.length === 0
    && ops.calendar.every((d) => d.planned + d.published + d.failed === 0);

  if (nothingRunning) {
    return (
      <Empty
        headline="No cycle is running."
        body="A waterfall starts when a URL is selected, its boards and keywords are assigned, and sixteen pins are generated from four designs. Today's queue, failures and the publishing calendar appear here once one is live."
      />
    );
  }

  const dueToday   = ops.today.filter((p) => p.status !== "PUBLISHED" && p.status !== "FAILED").length;
  const doneToday  = ops.today.filter((p) => p.status === "PUBLISHED").length;
  const fortnight  = ops.calendar.reduce((n, d) => n + d.planned, 0);

  return (
    <div>
      <Toolbar>
        <Metric label="Due today" value={dueToday} tone={dueToday ? "warn" : "good"} />
        <Metric label="Published today" value={doneToday} tone="good" />
        <Metric label="Failed (14d)" value={ops.failures.length} tone={ops.failures.length ? "bad" : "good"} />
        <Metric label="Scheduled ahead" value={fortnight} />
      </Toolbar>

      {/* ---- failures, first ---------------------------------------- */}
      {ops.failures.length > 0 && (
        <Band title="Failures"
              sub="Every one of these needs a decision. They do not retry themselves.">
          <Table>
            <thead>
              <tr>
                <TH>Pin</TH><TH>URL</TH><TH>Board</TH><TH>Reason</TH>
              </tr>
            </thead>
            <tbody>
              {ops.failures.map((p) => (
                <tr key={p.id} className="hover:bg-o-sunk/50">
                  <TD>
                    <span className="text-o-ink">{p.content_code ?? "—"}</span>
                    {p.design_number != null && (
                      <span className="ml-1.5 text-o-ink-3">D{p.design_number}{p.copy_variant}</span>
                    )}
                  </TD>
                  <TD muted={!p.url_name}>{p.url_name ?? "—"}</TD>
                  <TD muted={!p.board_name}>{p.board_name ?? "—"}</TD>
                  <TD className="text-o-neg">{p.failure_reason ?? "no reason recorded"}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Band>
      )}

      {/* ---- today's queue ------------------------------------------ */}
      <Band title="Today" sub={today}>
        {ops.today.length === 0 ? (
          <Panel className="px-5 py-4">
            <p className="text-[length:var(--text-o-body)] text-o-ink-3">
              Nothing is scheduled to publish today.
            </p>
          </Panel>
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Time</TH><TH>Pin</TH><TH>URL</TH><TH>Board</TH><TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {ops.today.map((p) => (
                <tr key={p.id} className="hover:bg-o-sunk/50">
                  <TD muted={!p.scheduled_time}>{p.scheduled_time?.slice(0, 5) ?? "—"}</TD>
                  <TD>
                    <span className="text-o-ink">{p.content_code ?? "—"}</span>
                    {p.design_number != null && (
                      <span className="ml-1.5 text-o-ink-3">D{p.design_number}{p.copy_variant}</span>
                    )}
                  </TD>
                  <TD muted={!p.url_name}>{p.url_name ?? "—"}</TD>
                  <TD muted={!p.board_name}>{p.board_name ?? "—"}</TD>
                  <TD><Pill tone={PIN_TONE[p.status] ?? "neutral"}>{p.status.toLowerCase()}</Pill></TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      {/* ---- the fortnight ------------------------------------------ */}
      <Band title="Publishing calendar"
            sub="Three days back, thirteen forward. A gap is as informative as a spike.">
        <Panel className="px-5 py-5">
          <PublishingCalendar days={ops.calendar} today={today} />
        </Panel>
      </Band>

      {/* ---- design x board ----------------------------------------- */}
      {ops.matrix.length > 0 && (
        <Band title="Design coverage"
              sub="Every design should reach every assigned board. A hole here is a board that will not rank.">
          <div className="space-y-5">
            {ops.matrix.map((w) => <DesignBoardMatrix key={w.waterfall_id} waterfall={w} />)}
          </div>
        </Band>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PublishingCalendar({
  days, today,
}: {
  days: CycleOps["calendar"];
  today: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.planned + d.published + d.failed));

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {days.map((d) => {
        const total = d.planned + d.published + d.failed;
        const isToday = d.day === today;
        const past = d.day < today;
        return (
          <div key={d.day} className="flex flex-col items-center gap-1.5 min-w-[2.1rem]">
            <span className={cn("o-num text-[length:var(--text-o-label)] tabular-nums",
              total === 0 ? "text-o-ink-3/50" : "text-o-ink-2")}>
              {total || ""}
            </span>
            {/* Stacked so published / planned / failed read at a glance
                without a legend nobody looks at twice. */}
            <div className="w-full flex flex-col-reverse justify-start rounded-[2px] bg-o-sunk overflow-hidden"
                 style={{ height: 68 }}
                 title={`${d.day} — ${d.published} published, ${d.planned} planned, ${d.failed} failed`}>
              {d.published > 0 && (
                <div style={{ height: `${(d.published / max) * 100}%`, background: DATA_COLORS.teal }} />
              )}
              {d.planned > 0 && (
                <div style={{ height: `${(d.planned / max) * 100}%`, background: DATA_COLORS.sand }} />
              )}
              {d.failed > 0 && (
                <div style={{ height: `${(d.failed / max) * 100}%`, background: "var(--color-o-neg)" }} />
              )}
            </div>
            <span className={cn("text-[length:var(--text-o-label)] whitespace-nowrap",
              isToday ? "text-o-ink font-semibold" : past ? "text-o-ink-3/60" : "text-o-ink-3")}>
              {isToday ? "today" : d.day.slice(8)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DesignBoardMatrix({
  waterfall,
}: {
  waterfall: CycleOps["matrix"][number];
}) {
  const designs = Array.from(new Set(waterfall.cells.map((c) => c.design_number))).sort((a, b) => a - b);
  const boards  = Array.from(new Set(waterfall.cells.map((c) => c.board_name))).sort();
  const at = (d: number, b: string) => waterfall.cells.find((c) => c.design_number === d && c.board_name === b);
  const intentOf = (d: number) => waterfall.cells.find((c) => c.design_number === d)?.intent ?? null;

  return (
    <Panel className="px-5 py-5">
      <p className="text-[length:var(--text-o-body)] text-o-ink font-medium mb-3">
        {waterfall.url_name ?? "(url removed)"}
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[length:var(--text-o-label)]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-o-ink-3 uppercase tracking-[0.06em]">
                Board
              </th>
              {designs.map((d) => (
                <th key={d} className="px-2 py-1.5 font-medium text-o-ink-3 whitespace-nowrap">
                  D{d}
                  {intentOf(d) && (
                    <span className="block font-normal normal-case tracking-normal text-o-ink-3/70">
                      {intentOf(d)!.toLowerCase()}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boards.map((b) => (
              <tr key={b}>
                <td className="px-2 py-1 text-o-ink-2 whitespace-nowrap max-w-[16rem] truncate" title={b}>
                  {b}
                </td>
                {designs.map((d) => {
                  const c = at(d, b);
                  return (
                    <td key={d} className="px-2 py-1 text-center">
                      {!c ? (
                        // A hole, drawn. An empty cell reads as "nothing to
                        // show"; a marked one reads as "this is missing".
                        <span className="inline-block w-5 h-5 leading-5 rounded-[2px] bg-o-sunk text-o-ink-3/60"
                              title="No pin for this design on this board">·</span>
                      ) : c.failed > 0 ? (
                        <span className="inline-block w-5 h-5 leading-5 rounded-[2px] bg-o-neg/12 text-o-neg font-semibold"
                              title={`${c.failed} failed of ${c.pins}`}>{c.failed}</span>
                      ) : c.published === c.pins ? (
                        <span className="inline-block w-5 h-5 leading-5 rounded-[2px] bg-o-pos/12 text-o-pos font-semibold"
                              title={`${c.published} published`}>{c.published}</span>
                      ) : (
                        <span className="inline-block w-5 h-5 leading-5 rounded-[2px] bg-o-sand/25 text-o-clay font-semibold"
                              title={`${c.published} of ${c.pins} published`}>{c.pins}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
