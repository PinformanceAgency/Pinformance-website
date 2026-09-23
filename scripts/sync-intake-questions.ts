/**
 * De intakevragen naast het echte Google Form leggen.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/sync-intake-questions.ts
 *
 * De intakestap in de onboarding is geen Google Form in een iframe, het is een
 * eigen formulier dat naar `formResponse` post. Elke vraag hangt daarmee aan een
 * `entry.NNN` van het echte formulier, en die twee kunnen uit elkaar lopen
 * zonder dat iemand het ziet: een vraag met een id dat niet meer bestaat wordt
 * door Google stil genegeerd. Het antwoord is dan getypt, verstuurd, bevestigd
 * met een vinkje — en staat nergens.
 *
 * Dit script leest de veld-ids uit de publieke `viewform`-pagina en vergelijkt
 * ze met `config.intake.questions`. Het rapporteert drie dingen:
 *
 *   - een vraag bij ons met een id dat het formulier niet kent  → gaat verloren
 *   - een vraag op het formulier die wij niet tonen             → wordt nooit ingevuld
 *   - een label dat verschilt                                   → ter informatie
 *
 * Het schrijft niets. Een nieuwe vraag toevoegen gaat zo: zet hem in Google
 * Forms, draai dit script, en plak de regel die het afdrukt in `config.ts`.
 *
 * Exit 1 zodra een vraag van ons een onbekend id heeft — dat is de enige stand
 * waarin een klant iets invult dat verdwijnt.
 */

import "dotenv/config";
import { ONBOARDING_CONFIG } from "../src/app/onboarding/config";
import type { IntakeQuestion } from "../src/app/onboarding/config";

interface LiveField {
  entryId: string;
  label: string;
  required: boolean;
}

/**
 * De velden uit de publieke formulierpagina.
 *
 * Google zet de hele definitie in één JS-variabele op die pagina. Er is geen
 * API voor nodig en geen inlog: dit is precies wat de browser van een invuller
 * ook binnenkrijgt.
 */
async function readForm(viewUrl: string): Promise<LiveField[]> {
  const res = await fetch(viewUrl, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`The form did not load: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/);
  if (!m) {
    throw new Error(
      "No form definition on that page. Is the form still public, and is the URL the /viewform one?"
    );
  }
  const data = JSON.parse(m[1]) as unknown[];
  // [1][1] is de lijst met vragen; per vraag is [1] de titel en [4][0][0] het
  // veld-id. Een vraag zonder id is een kop of een stuk tekst, geen invoer.
  const items = ((data[1] as unknown[])[1] ?? []) as unknown[][];
  const out: LiveField[] = [];
  for (const item of items) {
    const label = String(item[1] ?? "");
    const first = ((item[4] as unknown[]) ?? [])[0] as unknown[] | undefined;
    if (!first) continue;
    const id = first[0];
    if (id == null) continue;
    out.push({ entryId: `entry.${id}`, label, required: first[2] === 1 });
  }
  return out;
}

/** De /formResponse-URL uit de config terug naar de /viewform-variant. */
const viewUrlFrom = (responseUrl: string): string =>
  responseUrl.replace(/\/formResponse.*$/, "/viewform");

function main(): Promise<void> {
  const intake = ONBOARDING_CONFIG.intake;
  if (!intake.formResponseUrl) throw new Error("No formResponseUrl in config.ts.");

  return readForm(viewUrlFrom(intake.formResponseUrl)).then((live) => {
    const byId = new Map(live.map((f) => [f.entryId, f]));
    const ours = intake.questions as IntakeQuestion[];
    const ourIds = new Set(ours.map((q) => q.entryId));

    console.log(`Form: ${live.length} field(s)   config: ${ours.length} question(s)\n`);

    let broken = 0;
    for (const q of ours) {
      const hit = byId.get(q.entryId);
      if (!hit) {
        broken++;
        console.log(`  LOST      ${q.entryId}  "${q.label}"`);
        console.log(`            the form has no such field — anything typed here is dropped silently\n`);
        continue;
      }
      const same = hit.label.trim().replace(/[?.]$/, "").toLowerCase()
                === q.label.trim().replace(/[?.]$/, "").toLowerCase();
      console.log(`  ok        ${q.entryId}  "${q.label}"${same ? "" : `\n            form says: "${hit.label}"`}`);
    }

    const missing = live.filter((f) => !ourIds.has(f.entryId));
    if (missing.length > 0) {
      console.log(`\n${missing.length} field(s) on the form that the onboarding does not show.`);
      console.log(`Paste these into intake.questions in src/app/onboarding/config.ts:\n`);
      for (const f of missing) {
        const id = f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
        console.log(
          `      { id: "${id}", label: ${JSON.stringify(f.label)}, ` +
          `type: "text", entryId: "${f.entryId}", required: ${f.required} },`
        );
      }
    }

    if (broken > 0) {
      console.log(`\n${broken} question(s) point at a field the form does not have.`);
      process.exit(1);
    }
    if (missing.length === 0) console.log("\nForm and config agree.");
  });
}

main().catch((e) => { console.error(`\n${(e as Error).message}`); process.exit(1); });
