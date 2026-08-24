/**
 * LIBRARY · URLs — the cycle-planning surface.
 *
 * The manager picks next month's pages from this screen and nowhere else,
 * so the cooldown timeline leads: it answers "what can I run today" in one
 * glance, which a sortable table never does. The full table sits below it
 * as reference.
 */
import { loadUrls } from "@/lib/organic/workspace";
import { computeUrlRequirement, assessViability, loadProposals } from "@/lib/organic/expansion";
import { ExpansionPanel } from "./ExpansionPanel";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar, CooldownTimeline } from "@/components/organic/internal";

export const dynamic = "force-dynamic";

const REASON_TONE: Record<string, "good" | "warn" | "accent" | "neutral"> = {
  BEST_PERFORMER: "good", SEASONAL: "warn", CLIENT_REQUEST: "accent",
};

export default async function UrlsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [urls, requirement, assessment, proposals] = await Promise.all([
    loadUrls(orgId),
    computeUrlRequirement(orgId),
    assessViability(orgId),
    loadProposals(orgId),
  ]);

  const selectable = urls.filter((u) => u.is_selectable && !u.active_waterfall_status).length;
  const running = urls.filter((u) => u.active_waterfall_status).length;
  const inCooldown = urls.filter((u) => !u.cooldown_clear).length;

  // Derived on the server so the timeline's "today" matches the cooldown
  // dates it is drawn against, whatever the viewer's clock says.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <ExpansionPanel
        orgId={orgId}
        requirement={requirement}
        assessment={{
          buildable_pages: assessment.buildable_pages,
          existing_plus_buildable: assessment.existing_plus_buildable,
          verdict_suggested: assessment.verdict_suggested,
          reasoning: assessment.reasoning,
        }}
        proposals={proposals as Parameters<typeof ExpansionPanel>[0]["proposals"]}
      />

      <div className="mt-6">
        <Toolbar>
          <Metric label="URLs" value={urls.length} />
          <Metric label="Available now" value={selectable} tone={selectable ? "good" : "warn"} />
          <Metric label="In a running cycle" value={running} />
          <Metric label="In cooldown" value={inCooldown} />
        </Toolbar>
      </div>

      <Band title="Cooldown"
            sub="A URL rests after a waterfall so the next run is not competing with its own pins.">
        <Panel className="px-5 py-5">
          <CooldownTimeline
            today={today}
            rows={urls.map((u) => ({
              name: u.name,
              next_available_date: u.next_available_date,
              clear: u.cooldown_clear,
              active: u.active_waterfall_status,
            }))}
          />
        </Panel>
      </Band>

      <Band title="All URLs" sub={`${urls.length} captured.`}>
        {urls.length === 0 ? (
          <Empty
            headline="No URLs captured yet."
            body="Pages are collected during intake and selected for production in phase 4. A store needs enough distinct URLs to keep the waterfall fed without repeating a page before its cooldown clears."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>URL</TH>
                <TH>Reason</TH>
                <TH>Funnel</TH>
                <TH align="right">Cycles</TH>
                <TH align="right">Boards</TH>
                <TH align="right">Clicks</TH>
                <TH align="right">Saves</TH>
                <TH>Available</TH>
              </tr>
            </thead>
            <tbody>
              {urls.map((u) => (
                <tr key={u.id} className="hover:bg-o-sunk/50">
                  <TD>
                    <span className="block text-o-ink truncate max-w-[18rem]" title={u.url}>{u.name}</span>
                    <span className="block text-[length:var(--text-o-label)] text-o-ink-3 truncate max-w-[18rem]">
                      {u.type.toLowerCase()}
                      {u.is_seasonal && u.peak_window_start && ` · peaks ${u.peak_window_start}`}
                    </span>
                  </TD>
                  <TD>
                    <Pill tone={REASON_TONE[u.reason] ?? "neutral"}>
                      {u.reason.toLowerCase().replace(/_/g, " ")}
                    </Pill>
                  </TD>
                  <TD muted={!u.funnel_stage}>{u.funnel_stage?.toLowerCase() ?? "—"}</TD>
                  <TD align="right">{u.waterfalls_run}</TD>
                  <TD align="right">
                    {u.assigned_boards}
                    {!u.topic_covered && <span className="ml-1 text-o-neg" title="Topic under five boards — blocks selection">!</span>}
                  </TD>
                  <TD align="right">{u.total_outbound_clicks.toLocaleString("en-US")}</TD>
                  <TD align="right">{u.total_saves.toLocaleString("en-US")}</TD>
                  <TD>
                    {u.active_waterfall_status
                      ? <Pill tone="accent">{u.active_waterfall_status.toLowerCase()}</Pill>
                      : u.cooldown_clear
                        ? <Pill tone="good">now</Pill>
                        : <span className="text-o-ink-3">{u.cooldown_until ?? "—"}</span>}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>
    </div>
  );
}
