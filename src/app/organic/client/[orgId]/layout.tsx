import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { loadClientHeader } from "@/lib/organic/queries";
import { ClientTabs } from "./ClientTabs";
import { Label } from "@/components/organic/primitives";

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

  const facts: Array<[string, string | null]> = [
    ["Niche", header.niche],
    ["Engagement", header.engagement_status],
    ["Account", header.account_class ? `${header.account_class} · every ${header.spacing_hours}h` : null],
    ["Daily target", header.daily_pin_target != null ? String(header.daily_pin_target) : null],
    ["Domain", header.domain],
  ];

  return (
    <div className="max-w-[1180px]">
      <Link href="/"
        className="inline-flex items-center gap-1.5 text-[length:var(--text-o-body)] text-o-ink-3 hover:text-o-ink mb-5">
        <ArrowLeft className="w-3.5 h-3.5" /> All clients
      </Link>

      {/* Masthead. The serif name is what makes this read as a record of
          an account rather than a row in an admin table. */}
      <header className="pb-6 mb-6 border-b border-o-hairline">
        <h1 className="o-display text-[length:var(--text-o-figure-lg)] font-semibold text-o-ink leading-none tracking-[-0.015em]">
          {header.name}
        </h1>
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <Label>{k}</Label>
              <dd className={`mt-0.5 text-[length:var(--text-o-body)] ${v ? "text-o-ink" : "text-o-ink-3"}`}>
                {v ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {!header.activated ? (
        <div className="rounded-md border border-o-hairline bg-o-surface px-6 py-8 max-w-md">
          <p className="o-display text-[length:var(--text-o-figure-md)] text-o-ink leading-snug">
            This store is not activated.
          </p>
          <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
            Activating it creates the phase 1–3 task bank and opens the viability gate.
          </p>
          <Link href="/" className="mt-4 inline-block text-[length:var(--text-o-body)] font-medium text-o-accent hover:underline underline-offset-2">
            Back to client list
          </Link>
        </div>
      ) : (
        <>
          <ClientTabs orgId={orgId} phases={header.phases} />
          <div className="mt-8">{children}</div>
        </>
      )}
    </div>
  );
}
