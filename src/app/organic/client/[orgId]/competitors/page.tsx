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

  // Unieke pin-URL's, niet de som van de kolom: dezelfde pin staat bij
  // meerdere concurrenten in de bank, en een te grote som is precies het soort
  // getal waar later beleid op wordt gemaakt.
  const pinsHeld = summary.unique_pins;
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
                label="Their pins we hold"
                value={pinsHeld.toLocaleString("en-US")}
                hint={
                  summary.shared_pins > 0
                    ? `unique pins, across ${withPins} of the ${rows.length} accounts`
                    : `across ${withPins} of the ${rows.length} accounts`
                }
              />
              <Metric
                label="Not imported yet"
                value={rows.length - withPins}
                tone={rows.length - withPins > 0 ? "warn" : undefined}
                hint={
                  rows.length - withPins > 0
                    ? "their export is not in the bank yet (P2.1.6)"
                    : "an export has been read in for every account"
                }
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

            {/* De dubbeling wordt genoemd en niet weggerekend: het is research
                die overnieuw moet, en de som zou anders precies zo groot
                blijven als hij nu onterecht is. */}
            {summary.shared_pins > 0 && (
              <div className="mt-4 rounded-lg bg-o-accent/[0.07] ring-1 ring-inset ring-o-clay/25 px-3.5 py-3">
                <p className="text-sm font-medium text-foreground">
                  The same pins are filed under more than one account
                </p>
                <p className="mt-1 text-sm text-o-ink-2">
                  {summary.total_rows.toLocaleString("en-US")} rows hold{" "}
                  {summary.unique_pins.toLocaleString("en-US")} different pins, and{" "}
                  {summary.shared_pins.toLocaleString("en-US")} of those sit under several competitors
                  at once. That is what an import looks like when one export was read in against more
                  than one account. The per-account counts below are therefore not each account&rsquo;s
                  own pins, and the volume this niche appears to have is overstated. Re-importing per
                  competitor (P2.1.6) is what fixes it.
                </p>
              </div>
            )}

            <p className="mt-3 text-[length:var(--text-o-label)] text-o-ink-3">
              The boards come out of the {pinsHeld.toLocaleString("en-US")} pins read in with the
              competitor import, not from a separate measurement. They say where their volume sits,
              not which of their pins performed best.
              {header?.name ? ` Store: ${header.name}.` : ""}
            </p>
          </>
        )}
      </Band>
    </div>
  );
}
