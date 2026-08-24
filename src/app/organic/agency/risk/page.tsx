/**
 * AGENCY · Risk — the churn list, three months early.
 *
 * Ranked by consequence, not by which check happened to run first. A
 * store loses a client long before it cancels, and every flag here is a
 * thing that was visible in the data at the time.
 */
import Link from "next/link";
import { loadPortfolio, loadRisk } from "@/lib/organic/agency";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric, Toolbar } from "@/components/organic/internal";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  below_baseline: "Below baseline",
  performance_declining: "Performance declining",
  onboarding_overrun: "Onboarding overrun",
  client_unresponsive: "Client unresponsive",
  nothing_queued: "Nothing queued",
  no_topic_covered: "No topic covered",
  no_token: "No Pinterest token",
  token_expired: "Token expired",
  token_expiring: "Token expiring",
};

const RANK_TONE: Record<number, "bad" | "warn" | "neutral"> = { 1: "bad", 2: "warn", 3: "neutral" };
const RANK_WORD: Record<number, string> = { 1: "act now", 2: "this week", 3: "watch" };

export default async function RiskPage() {
  const portfolio = await loadPortfolio();
  const flags = await loadRisk(portfolio);

  const urgent = flags.filter((f) => f.rank === 1).length;
  const soon = flags.filter((f) => f.rank === 2).length;
  const storesFlagged = new Set(flags.map((f) => f.org_id)).size;

  return (
    <div>
      <Toolbar>
        <Metric label="Flags" value={flags.length} tone={flags.length ? "warn" : "good"} />
        <Metric label="Act now" value={urgent} tone={urgent ? "bad" : "good"} />
        <Metric label="This week" value={soon} tone={soon ? "warn" : "good"} />
        <Metric label="Stores flagged" value={`${storesFlagged}/${portfolio.length}`} />
      </Toolbar>

      <Band title="Open flags"
            sub="Sorted by what it costs to ignore, not by when it appeared.">
        {flags.length === 0 ? (
          <Panel className="px-6 py-8">
            <div className="max-w-[44rem]">
              <p className="o-display text-[length:var(--text-o-figure-md)] text-o-ink leading-snug">
                Nothing is flagged.
              </p>
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                That is a real result here rather than an empty screen: every check ran
                across {portfolio.length} store{portfolio.length === 1 ? "" : "s"} and found
                nothing. Performance checks only fire once a store has a phase-1 baseline
                and measured results, so a book this early will show fewer flags than a
                mature one — silence now is not the same as safety later.
              </p>
            </div>
          </Panel>
        ) : (
          <Table>
            <thead>
              <tr><TH>Priority</TH><TH>Store</TH><TH>Flag</TH><TH>Detail</TH></tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={`${f.org_id}-${f.kind}-${i}`} className="hover:bg-o-sunk/50">
                  <TD><Pill tone={RANK_TONE[f.rank] ?? "neutral"}>{RANK_WORD[f.rank] ?? "watch"}</Pill></TD>
                  <TD>
                    <Link href={`/client/${f.org_id}`} className="text-o-ink hover:underline underline-offset-2">
                      {f.name}
                    </Link>
                  </TD>
                  <TD>{KIND_LABEL[f.kind] ?? f.kind.replace(/_/g, " ")}</TD>
                  <TD muted>{f.detail}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Band>

      <Band title="What is checked"
            sub="So an empty list can be read as evidence rather than as a gap.">
        <Panel className="px-5 py-5">
          <ul className="space-y-2 text-[length:var(--text-o-body)] text-o-ink-2">
            <li><span className="text-o-ink">Below baseline</span> — outbound clicks under the phase-1 baseline. Needs a captured baseline.</li>
            <li><span className="text-o-ink">Performance declining</span> — clicks down more than 15% month over month. Needs two measured months.</li>
            <li><span className="text-o-ink">Onboarding overrun</span> — month two or later with phase 1–3 unfinished.</li>
            <li><span className="text-o-ink">Client unresponsive</span> — a task marked waiting on the client for over 14 days.</li>
            <li><span className="text-o-ink">Nothing queued</span> — an active store with no pins scheduled ahead.</li>
            <li><span className="text-o-ink">No topic covered</span> — no topic reaches five boards, so phase 4 cannot start.</li>
            <li><span className="text-o-ink">Token</span> — Pinterest token missing, expired, or lapsing within 14 days.</li>
          </ul>
        </Panel>
      </Band>

      {portfolio.length === 0 && (
        <Empty headline="No stores activated." body="Risk is computed across the activated book." />
      )}
    </div>
  );
}
