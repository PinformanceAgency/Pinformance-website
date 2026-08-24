import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader } from "@/lib/organic/queries";
import { Label } from "@/components/organic/primitives";

export const dynamic = "force-dynamic";

/**
 * Store chrome.
 *
 * The horizontal tab strip that used to live here is gone — the sidebar
 * carries navigation now, all the way down to individual SOP tasks, and
 * duplicating it above the content meant two places to look for the same
 * thing. The store name went with it: the sidebar switcher states which
 * client is open, and repeating it on every page was a masthead saying
 * what the chrome already said.
 *
 * What remains is the fact bar — the handful of settings that change how
 * every screen below should be read.
 */
export default async function ClientLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const header = await loadClientHeader(orgId);
  if (!header) notFound();

  if (!header.activated) {
    return (
      <div>
        <div className="rounded-lg border border-o-hairline bg-o-surface px-6 py-8 max-w-md">
          <h1 className="o-display text-[length:var(--text-o-figure-md)] text-o-ink leading-snug">
            {header.name} is not activated.
          </h1>
          <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
            Activating it creates the phase 1–3 task bank and opens the viability gate.
            Until then this store has no phases, library or report.
          </p>
          <Link href="/"
                className="mt-4 inline-block text-[length:var(--text-o-body)] font-medium text-o-accent hover:underline underline-offset-2">
            Back to client list
          </Link>
        </div>
      </div>
    );
  }

  const facts: Array<[string, string | null]> = [
    ["Niche", header.niche],
    ["Engagement", header.engagement_status],
    ["Account", header.account_class ? `${header.account_class} · every ${header.spacing_hours}h` : null],
    ["Daily target", header.daily_pin_target != null ? String(header.daily_pin_target) : null],
    ["Domain", header.domain],
  ];

  return (
    <div>
      <dl className="flex flex-wrap gap-x-10 gap-y-3 pb-5 mb-7 border-b border-o-hairline">
        {facts.map(([k, v]) => (
          <div key={k}>
            <Label>{k}</Label>
            <dd className={`mt-0.5 text-[length:var(--text-o-body)] ${v ? "text-o-ink" : "text-o-ink-3"}`}>
              {v ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
