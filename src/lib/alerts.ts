/**
 * Slack-alarm voor crons die 's nachts draaien zonder dat er iemand meekijkt.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Op 17-08-2026 werd weekly-update-seed na 18 van de 49 stores afgekapt. Dat
 * viel pas op toen er toevallig iemand keek. Sindsdien faalt die run zichtbaar
 * (de eindcontrole gooit, de route geeft 500), maar een 500 in de Vercel-logs
 * is nog steeds iets wat iemand moet gaan opzoeken. Dit stuurt hem achterna.
 *
 * CONFIGURATIE
 * ------------
 * Eén env-var: SLACK_ALERT_WEBHOOK, een Slack Incoming Webhook URL. Het kanaal
 * zit in die URL, dus er valt hier verder niets in te stellen.
 *
 * Staat de var niet ingevuld -- lokaal, in preview -- dan gebeurt er niets en
 * schrijft hij één regel naar de console. Zo hoef je voor een lokale run geen
 * secret te hebben, en post een test nooit per ongeluk in het kanaal.
 *
 * DIT MAG NOOIT EEN RUN LATEN OMVALLEN
 * ------------------------------------
 * Een kapot alarm is vervelend; een cron die stukgaat OMDAT het alarm niet
 * bezorgd kon worden is erger -- dan verlies je de run die wél werkte. Alles
 * hieronder vangt zijn eigen fouten af en geeft `false` terug in plaats van te
 * gooien. De aanroeper hoeft de uitkomst niet te controleren.
 */

/** Hoe lang we maximaal op Slack wachten. Kort: dit hangt aan een cron-timeout. */
const SLACK_TIMEOUT_MS = 5_000;

export interface CronAlert {
  /** Naam van de cron, bv. 'weekly-update-seed'. */
  cron: string;
  /** Eén regel die zegt wat er mis is. */
  message: string;
  /** Optioneel: de onderliggende fout. */
  error?: unknown;
}

function describeError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return String(error);
  }
}

/**
 * Post een alarm in Slack. Geeft `true` als het bericht eruit is, `false` als
 * er geen webhook is ingesteld of als Slack niet meewerkte. Gooit nooit.
 */
export async function alertCronFailure(alert: CronAlert): Promise<boolean> {
  const webhook = process.env.SLACK_ALERT_WEBHOOK;
  if (!webhook) {
    console.warn(
      `[alerts] SLACK_ALERT_WEBHOOK niet ingesteld -- geen Slack-melding voor ${alert.cron}: ${alert.message}`
    );
    return false;
  }

  const detail = describeError(alert.error);
  const text = [
    `:rotating_light: *Cron gefaald: ${alert.cron}*`,
    alert.message,
    detail ? `\`\`\`${detail}\`\`\`` : null,
    `Logs: https://vercel.com/pinformance-tt/pinformance-dashboard/logs`,
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // Slack antwoordt met platte tekst ('invalid_token', 'no_service'), niet JSON.
      const body = await resp.text().catch(() => "");
      console.error(
        `[alerts] Slack weigerde de melding voor ${alert.cron}: HTTP ${resp.status} ${body}`.trim()
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(
      `[alerts] Slack-melding voor ${alert.cron} mislukt:`,
      e instanceof Error ? e.message : e
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
