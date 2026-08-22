import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader, loadClientTasks } from "@/lib/organic/queries";
import { loadViability } from "@/lib/organic/viability";
import { TasksBoard } from "./TasksBoard";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const [header, tasks, viability] = await Promise.all([
    loadClientHeader(orgId),
    loadClientTasks(orgId),
    loadViability(orgId),
  ]);
  if (!header) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900">
          ← Back to clients
        </Link>
        {header.activated && (
          <Link
            href={`/client/${orgId}/intake`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Open intake form →
          </Link>
        )}
      </div>

      <ClientHeaderCard header={header} />

      {!header.activated ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This client is not activated yet. Go back to the list to activate.
        </div>
      ) : (
        <TasksBoard
          orgId={orgId}
          tasks={tasks}
          viability={viability}
          initialDomain={header.domain}
        />
      )}
    </div>
  );
}

function ClientHeaderCard({
  header,
}: {
  header: NonNullable<Awaited<ReturnType<typeof loadClientHeader>>>;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{header.name}</h1>
          <div className="mt-1 text-xs text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Niche: {header.niche ?? "—"}</span>
            <span>·</span>
            <span>Engagement: {header.engagement_status ?? "—"}</span>
            <span>·</span>
            <span>
              Account: {header.account_class ?? "—"}
              {header.spacing_hours != null && ` · every ${header.spacing_hours}h`}
            </span>
            <span>·</span>
            <span>Daily target: {header.daily_pin_target ?? "—"}</span>
            {header.domain && (
              <>
                <span>·</span>
                <span>Domain: {header.domain}</span>
              </>
            )}
            {header.onboarded_date && (
              <>
                <span>·</span>
                <span>Onboarded {header.onboarded_date}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {header.phases.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-neutral-200 border-t border-neutral-100">
          {header.phases.map((p) => (
            <div key={p.phase} className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
                Phase {p.phase}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-semibold tabular-nums">{p.pct_done}%</span>
                <span className="text-xs text-neutral-500 tabular-nums">
                  {p.done_tasks}/{p.total_tasks}
                </span>
              </div>
              {p.blocked_tasks > 0 && (
                <div className="mt-1 text-[11px] text-red-600 font-medium tabular-nums">
                  {p.blocked_tasks} blocked
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
