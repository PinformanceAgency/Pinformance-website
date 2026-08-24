import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadClientHeader } from "@/lib/organic/queries";
import { ClientTabs } from "./ClientTabs";

export const dynamic = "force-dynamic";

export default async function ClientLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const header = await loadClientHeader(orgId);
  if (!header) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Link href="/" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> All clients
        </Link>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{header.name}</h1>
            <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Niche: {header.niche ?? "—"}</span>
              <span>·</span>
              <span>Engagement: {header.engagement_status ?? "—"}</span>
              <span>·</span>
              <span>Account: {header.account_class ?? "—"}{header.spacing_hours != null && ` · every ${header.spacing_hours}h`}</span>
              <span>·</span>
              <span>Daily target: {header.daily_pin_target ?? "—"}</span>
              {header.domain && <><span>·</span><span>Domain: {header.domain}</span></>}
              {header.onboarded_date && <><span>·</span><span>Onboarded {header.onboarded_date}</span></>}
            </div>
          </div>
        </div>

        {header.phases.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-border border-t border-border">
            {header.phases.map((p) => (
              <div key={p.phase} className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Phase {p.phase}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xl font-semibold tabular-nums text-foreground">{p.pct_done}%</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{p.done_tasks}/{p.total_tasks}</span>
                </div>
                {p.blocked_tasks > 0 && (
                  <div className="mt-1 text-[11px] font-medium tabular-nums text-red-600">{p.blocked_tasks} blocked</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!header.activated ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This client is not activated yet. Go back to the list to activate.
        </div>
      ) : (
        <>
          <ClientTabs orgId={orgId} phases={header.phases} />
          <div>{children}</div>
        </>
      )}
    </div>
  );
}
