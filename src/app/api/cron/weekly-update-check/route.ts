/**
 * Weekly Update Check — kijkt of de weekregels op het Monday-bord "Weekly
 * Updates" daadwerkelijk gevuld zijn. Draait maandag 13:00 UTC, een uur na de
 * sync (zie vercel.json). Schrijft niets.
 *
 * WAAROM DIT LOS VAN DE SYNC STAAT
 * --------------------------------
 * De sync controleert zichzelf aan het eind van zijn eigen run. Dat helpt niet
 * in het geval dat we willen vangen: op 17-08-2026 werd die run na 13 van de 37
 * stores afgekapt, en dan wordt de eigen eindcontrole -- en dus ook de
 * Slack-melding -- nooit bereikt. Het enige signaal was een log dat ophield,
 * en daar kijkt op maandagmiddag niemand.
 *
 * Deze route draait in een eigen invocatie en doet vier calls: het klantbord en
 * drie pagina's subitems. Dat is binnen enkele seconden klaar, dus hij kan niet
 * in dezelfde tijdslimiet lopen als de run die hij controleert.
 *
 * Er gaat één Slack-melding uit als er iets ontbreekt, en anders niets -- een
 * kanaal dat elke maandag "alles goed" roept, lees je na drie weken niet meer.
 *
 * Benodigde env-vars in Vercel (naast CRON_SECRET):
 *   MONDAY_API_TOKEN, SLACK_ALERT_WEBHOOK
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// Vier reads. Ruim binnen elke limiet; staat hier alleen zodat een trage
// Monday-respons niet halverwege wordt afgebroken.
export const maxDuration = 60;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function handle(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const started = Date.now();
    const { checkWeekFilled } = await import(
      "../../../../../scripts/weekly-update-sync"
    );
    const check = await checkWeekFilled();

    // Twee verschillende storingen, bewust in één melding: als de seed niet is
    // afgemaakt ontbreken de regels zelf, en dan heeft het weinig zin om ook
    // nog te melden dat er geen cijfers in staan.
    const problems: string[] = [];
    if (check.noRow.length) {
      problems.push(
        `${check.noRow.length} stores hebben helemaal geen weekregel voor ` +
          `${check.week} -- de seed van 01:00 is niet afgemaakt, of ze zijn ` +
          `daarna pas geonboard: ${check.noRow.join(", ")}`
      );
    }
    if (check.missing.length) {
      problems.push(
        `${check.missing.length} gekoppelde stores staan zonder cijfers voor ` +
          `${check.week}: ${check.missing.join(", ")}`
      );
    }

    if (problems.length) {
      // De handmatige stores staan er alleen bij als er tóch al een melding
      // uitgaat: dat ze leeg zijn is normaal, maar als er iemand gaat nalopen
      // is het handig om ze in hetzelfde bericht te hebben.
      if (check.manual.length) {
        problems.push(
          `Nog met de hand in te vullen (niet gekoppeld): ${check.manual.join(", ")}`
        );
      }
      await alertCronFailure({
        cron: "weekly-update-check",
        message: problems.join("\n"),
      });
    }

    return NextResponse.json({
      ok: problems.length === 0,
      elapsed_ms: Date.now() - started,
      week: check.week,
      stores_total: check.total,
      stores_missing: check.missing,
      stores_without_row: check.noRow,
      stores_manual: check.manual,
    });
  } catch (e) {
    // Ook dit meldt zich: een controle die zelf omvalt is een controle die je
    // niet hebt.
    await alertCronFailure({
      cron: "weekly-update-check",
      message:
        "De controle op het Weekly Updates-bord is niet gelukt. Of de cijfers " +
        "van vorige week erin staan is nu onbekend -- kijk zelf even op het bord.",
      error: e,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
