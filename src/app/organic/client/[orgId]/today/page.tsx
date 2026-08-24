/**
 * TODAY · the one screen a manager opens first.
 *
 * It answers a single question — what can I actually do on this store
 * right now — and everything that does not serve that answer is left to
 * the other screens. Blocked work is counted, not listed: a to-do list
 * that includes things you cannot start is a list people stop reading.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader } from "@/lib/organic/queries";
import { loadToday, loadCycleOps, loadLeaks } from "@/lib/organic/workspace";
import { Band, Panel, Empty, AccentLink } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar } from "@/components/organic/internal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, "good" | "warn" | "accent" | "neutral"> = {
  AUTO: "good", AI_DRAFT: "accent", IN_DASHBOARD: "neutral", EXTERNAL: "warn",
};

const TYPE_LABEL: Record<string, string> = {
  AUTO: "automatic", AI_DRAFT: "AI drafts", IN_DASHBOARD: "in dashboard", EXTERNAL: "external tool",
};

export default async function TodayPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [header, today, ops, leaks] = await Promise.all([
    loadClientHeader(orgId),
    loadToday(orgId),
    loadCycleOps(orgId),
    loadLeaks(orgId),
  ]);
  if (!header) notFound();

  const base = `/client/${orgId}`;
  const dueToday = ops.today.filter((p) => p.status !== "PUBLISHED" && p.status !== "FAILED");
  const urgentLeaks = leaks.filter((l) => l.severity === "high").slice(0, 3);
  const nothingToDo =
    today.actionable.length === 0 && today.in_progress.length === 0 &&
    today.in_review.length === 0 && dueToday.length === 0 && ops.failures.length === 0;

  const TaskRows = ({ rows }: { rows: typeof today.actionable }) => (
    <Table>
      <thead>
        <tr><TH>Task</TH><TH>Step</TH><TH>How</TH><TH></TH></tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.task_id} className="hover:bg-o-sunk/50">
            <TD>
              <span className="o-num text-[length:var(--text-o-label)] text-o-ink-3 mr-2">{t.task_id}</span>
              <span className="text-o-ink">{t.name}</span>
            </TD>
            <TD muted>{t.phase}.{t.step}</TD>
            <TD><Pill tone={TYPE_TONE[t.task_type] ?? "neutral"}>{TYPE_LABEL[t.task_type] ?? t.task_type.toLowerCase()}</Pill></TD>
            <TD align="right">
              <Link href={`${base}/phase/${t.phase}/${t.step}#${t.task_id}`}
                    className="text-o-accent hover:underline underline-offset-2">
                Open
              </Link>
            </TD>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <div>
      <Toolbar>
        <Metric label="Ready to start" value={today.actionable.length}
                tone={today.actionable.length ? "warn" : "good"} />
        <Metric label="In progress" value={today.in_progress.length} />
        <Metric label="Awaiting review" value={today.in_review.length} />
        <Metric label="Publishing today" value={dueToday.length} />
        <Metric label="Failed" value={ops.failures.length} tone={ops.failures.length ? "bad" : "good"} />
        <Metric label="Blocked" value={today.blocked_count} />
      </Toolbar>

      {nothingToDo && (
        <Empty
          headline="Nothing is waiting on you for this store."
          body={today.blocked_count > 0
            ? `${today.blocked_count} task${today.blocked_count === 1 ? " is" : "s are"} blocked behind an earlier step, and nothing is publishing or failed today. The blocked work unblocks itself as the steps ahead of it complete.`
            : "No task is ready to start, nothing publishes today, and nothing has failed. Check the other stores, or open Overview to see where this one stands."}
        />
      )}

      {/* ---- failures first ---------------------------------------- */}
      {ops.failures.length > 0 && (
        <Band title="Failed"
              sub="These do not retry themselves. Each one needs a decision.">
          <Table>
            <thead>
              <tr><TH>Pin</TH><TH>URL</TH><TH>Board</TH><TH>Reason</TH></tr>
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

      {/* ---- in review --------------------------------------------- */}
      {today.in_review.length > 0 && (
        <Band title="Waiting on your review"
              sub="Drafted and ready for a decision — the fastest work on this page.">
          <TaskRows rows={today.in_review} />
        </Band>
      )}

      {/* ---- in progress ------------------------------------------- */}
      {today.in_progress.length > 0 && (
        <Band title="In progress" sub="Picked up but not finished.">
          <TaskRows rows={today.in_progress} />
        </Band>
      )}

      {/* ---- ready to start ---------------------------------------- */}
      {today.actionable.length > 0 && (
        <Band title="Ready to start"
              sub={`In SOP order. ${today.blocked_count} further task${today.blocked_count === 1 ? "" : "s"} ${today.blocked_count === 1 ? "is" : "are"} blocked behind these.`}>
          <TaskRows rows={today.actionable} />
        </Band>
      )}

      {/* ---- publishing today -------------------------------------- */}
      {ops.today.length > 0 && (
        <Band title="Publishing today" sub={new Date().toISOString().slice(0, 10)}>
          <Table>
            <thead>
              <tr><TH>Time</TH><TH>Pin</TH><TH>URL</TH><TH>Board</TH><TH>Status</TH></tr>
            </thead>
            <tbody>
              {ops.today.map((p) => (
                <tr key={p.id} className="hover:bg-o-sunk/50">
                  <TD muted={!p.scheduled_time}>{p.scheduled_time?.slice(0, 5) ?? "—"}</TD>
                  <TD>{p.content_code ?? "—"}</TD>
                  <TD muted={!p.url_name}>{p.url_name ?? "—"}</TD>
                  <TD muted={!p.board_name}>{p.board_name ?? "—"}</TD>
                  <TD>
                    <Pill tone={p.status === "PUBLISHED" ? "good" : p.status === "FAILED" ? "bad" : "neutral"}>
                      {p.status.toLowerCase()}
                    </Pill>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Band>
      )}

      {/* ---- costly leaks ------------------------------------------ */}
      {urgentLeaks.length > 0 && (
        <Band title="Worth fixing now"
              sub="The most expensive open leaks. The full list is on Overview.">
          <div className="space-y-3">
            {urgentLeaks.map((l) => (
              <Panel key={l.kind} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn("text-[length:var(--text-o-body)] text-o-ink")}>{l.label}</p>
                    <p className="mt-0.5 text-[length:var(--text-o-label)] text-o-ink-3 leading-relaxed">
                      {l.cost}
                    </p>
                  </div>
                  <AccentLink href={`${base}/${l.fix_href}`}>
                    Fix{l.fix_task ? ` · ${l.fix_task}` : ""}
                  </AccentLink>
                </div>
              </Panel>
            ))}
          </div>
        </Band>
      )}
    </div>
  );
}
