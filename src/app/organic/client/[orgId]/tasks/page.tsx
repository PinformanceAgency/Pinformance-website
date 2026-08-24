import Link from "next/link";
import { loadClientHeader, loadClientTasks } from "@/lib/organic/queries";
import { loadViability } from "@/lib/organic/viability";
import { loadPhase2Snapshot } from "@/lib/organic/phase2";
import { loadPhase3Snapshot } from "@/lib/organic/phase3";
import { TasksBoard } from "../TasksBoard";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  params, searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const [header, tasks, viability, phase2, phase3] = await Promise.all([
    loadClientHeader(orgId),
    loadClientTasks(orgId),
    loadViability(orgId),
    loadPhase2Snapshot(orgId),
    loadPhase3Snapshot(orgId),
  ]);
  if (!header) return null;

  const onboardingDone = header.phases.slice(0, 3).every((p) => p.pct_done === 100);
  // Default mode: onboarding while phases 1-3 are running, recurring once done.
  const mode = (sp.mode as "onboarding" | "recurring") ?? (onboardingDone ? "recurring" : "onboarding");

  // Onboarding view = phases 1-3 flat tasks (the current TasksBoard already filters cycle rows).
  // Recurring view = phases 4-5 (cycles + monthly reporting) — routes to Cycles tab.
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs">
        <Link href={`/client/${orgId}/tasks?mode=onboarding`}
          className={`px-3 py-1 rounded-md border ${mode === "onboarding" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted text-foreground"}`}>
          Onboarding (phases 1–3)
        </Link>
        <Link href={`/client/${orgId}/tasks?mode=recurring`}
          className={`px-3 py-1 rounded-md border ${mode === "recurring" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted text-foreground"}`}>
          Recurring (phases 4–5)
        </Link>
        <span className="flex-1" />
        <Link href={`/client/${orgId}/intake`} className="text-xs text-muted-foreground hover:text-foreground">
          Open intake form →
        </Link>
      </div>

      {mode === "onboarding" ? (
        <TasksBoard
          orgId={orgId}
          tasks={tasks.filter((t) => t.phase <= 3)}
          viability={viability}
          initialDomain={header.domain}
          phase2={phase2}
          phase3={phase3}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>Recurring work is organised by URL cycle and monthly reporting cadence, not as a flat list.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={`/client/${orgId}/cycles`} className="text-primary font-medium hover:underline">Open Cycles →</Link>
            <Link href={`/client/${orgId}/analytics`} className="text-primary font-medium hover:underline">Open Analytics →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
