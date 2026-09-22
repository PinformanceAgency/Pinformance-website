/**
 * LIBRARY · Competitors — de accounts om naar te kijken.
 *
 * Eén ding, bewust: een lijst met klikbare Pinterest-profielen, zodat
 * Clarisse kan zien hoe een goede concurrent zijn organic account inricht.
 * Besloten 22-09-2026 (Tristan) — geen screenshots en geen visuele kenmerken
 * per pin in onze database. De competitors stonden er al, alle 57 met naam,
 * handle en profiel-URL, dus hier hoefde geen kolom bij.
 *
 * Waarom dit een bibliotheekpagina is en geen fase-2 taak: de concurrenten
 * worden één keer verzameld (P2.1.5) en daarna maandenlang *geraadpleegd*,
 * midden in fase 4 als de vraag "hoe ziet een goede pin in deze niche eruit"
 * op tafel ligt. Dat is precies wat de library is — naast Research, Boards,
 * Keywords, URLs en de Creative Machine.
 *
 * De cijfers ernaast zijn er alleen om te kiezen wie je opent: hoe actief ze
 * zijn, hoeveel van hun pins wij al gelezen hebben, en op welke boards die
 * pins staan. Dat laatste is de snelste samenvatting van hun accountindeling
 * die we hebben, en hij komt uit research die er al ligt.
 */
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { loadCompetitorLibrary } from "@/lib/organic/phase2";
import { loadClientHeader } from "@/lib/organic/queries";
import { Band, Panel, Empty } from "@/components/organic/primitives";
import { Table, TH, TD, Pill, Metric } from "@/components/organic/internal";

export const dynamic = "force-dynamic";

const FIT_TONE: Record<string, "good" | "warn" | "neutral"> = {
  STRONG: "good", MODERATE: "warn", WEAK: "neutral",
};

/** Het aantal concurrenten dat de methode vraagt (module 2, P2.1.5). */
const TARGET_MIN = 5;
const TARGET_MAX = 10;

export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const [header, library] = await Promise.all([
    loadClientHeader(orgId),
    loadCompetitorLibrary(orgId),
  ]);
  const { rows, summary } = library;

  // Twee getallen die niet hetzelfde zijn en dat ook zo moeten blijven: alle
  // pins die de import opleverde (niche-research, van wie dan ook) en de pins
  // die onze eigen concurrenten hebben gepind. Zie migratie 108.
  const nichePins = summary.niche_pins;
  const ownPins = summary.own_competitor_pins;
  const withPins = rows.filter((r) => r.pins_imported > 0).length;

  return (
    <div>
      <Band
        title="Competitors"
        sub={
          `The accounts this niche learns from on Pinterest. Open a profile to see how they lay out ` +
          `their boards, which formats they post and what their pins look like.`
        }
      >
        {rows.length === 0 ? (
          <Empty
            headline="No competitors recorded yet"
            body={
              `The method asks for ${TARGET_MIN} to ${TARGET_MAX} competitors per store. They are ` +
              `collected in phase 2, step 1 (P2.1.5) — after that they sit here to be looked at.`
            }
            action={
              <Link href={`/client/${orgId}/phase/2/1`} className="o-btn o-btn-quiet">
                Go to phase 2 · step 1
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 mb-5">
              <Metric
                label="Competitors"
                value={rows.length}
                tone={rows.length < TARGET_MIN ? "warn" : undefined}
                hint={
                  rows.length < TARGET_MIN
                    ? `the method asks for ${TARGET_MIN} to ${TARGET_MAX}`
                    : `within the ${TARGET_MIN}–${TARGET_MAX} the method asks for`
                }
              />
              <Metric
                label="Their own pins"
                value={ownPins.toLocaleString("en-US")}
                hint={`pinned by ${withPins} of the ${rows.length} accounts themselves`}
              />
              <Metric
                label="Niche pins held"
                value={nichePins.toLocaleString("en-US")}
                hint={`from ${summary.distinct_pinners.toLocaleString("en-US")} different accounts in total`}
              />
            </div>

            <Panel>
              <Table>
                <thead>
                  <tr>
                    <TH>Account</TH>
                    <TH>Niche fit</TH>
                    <TH align="right">Pins/day</TH>
                    <TH align="right">Pins we hold</TH>
                    <TH>Their busiest boards</TH>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <TD>
                        {/* De link is waar deze pagina voor bestaat, dus hij is
                            het eerste en het grootste op de regel. */}
                        <a
                          href={c.profile_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-baseline gap-1.5 font-medium text-foreground hover:text-o-accent"
                        >
                          {c.name?.trim() || c.handle || c.profile_url}
                          <ExternalLink className="w-3 h-3 shrink-0 translate-y-[1px]" aria-hidden />
                        </a>
                        <div className="text-[length:var(--text-o-label)] text-o-ink-3">
                          {c.handle ?? "—"}
                          {c.analyzed_at && <span> · reviewed {c.analyzed_at}</span>}
                        </div>
                      </TD>
                      <TD>
                        {c.niche_fit
                          ? <Pill tone={FIT_TONE[c.niche_fit] ?? "neutral"}>{c.niche_fit.toLowerCase()}</Pill>
                          : <span className="text-o-ink-3">—</span>}
                      </TD>
                      <TD align="right" muted>
                        {/* Nul is een gemeten nul (een account dat stilligt) en
                            niet hetzelfde als niet gemeten — zie provenance.ts. */}
                        {c.pins_per_day_4mo == null
                          ? <span title="not measured">—</span>
                          : c.pins_per_day_4mo.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </TD>
                      <TD align="right" muted>
                        {c.pins_imported > 0
                          ? c.pins_imported.toLocaleString("en-US")
                          : <span title="their export has not been read in yet (P2.1.6)">—</span>}
                      </TD>
                      <TD muted>
                        {c.top_boards.length > 0
                          ? c.top_boards.join(" · ")
                          : <span className="text-o-ink-3">—</span>}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Panel>

            {/* Het verschil tussen de twee getallen hierboven is de kern, en het
                staat er met de reden: de exports zijn keyword-exports, dus het
                grootste deel van die pins is van iemand anders. Dat is bruikbare
                niche-research zolang niemand het "onze concurrenten" noemt. */}
            {nichePins > ownPins && (
              <div className="mt-4 rounded-lg bg-o-sunk px-3.5 py-3 ring-1 ring-inset ring-o-hairline">
                <p className="text-sm font-medium text-foreground">
                  Most of that research is not theirs — and that is fine
                </p>
                <p className="mt-1 text-sm text-o-ink-2">
                  The competitor exports are keyword exports: they hold the pins that rank for a
                  search, whoever posted them. Of the {nichePins.toLocaleString("en-US")} pins in this
                  store&rsquo;s bank, {ownPins.toLocaleString("en-US")} were pinned by one of the
                  accounts below and the rest by{" "}
                  {(summary.distinct_pinners - withPins).toLocaleString("en-US")} others. That is real
                  niche research — which pins win here, on which boards, with how many saves, and it
                  is what the design brief reads. It is just not a measure of these competitors.
                </p>
              </div>
            )}

            <p className="mt-3 text-[length:var(--text-o-label)] text-o-ink-3">
              The boards in the last column are the boards each account&rsquo;s own pins sit on, from
              the import rather than a separate measurement. They say where that account&rsquo;s
              volume is, not which of their pins performed best.
              {header?.name ? ` Store: ${header.name}.` : ""}
            </p>
          </>
        )}
      </Band>
    </div>
  );
}
