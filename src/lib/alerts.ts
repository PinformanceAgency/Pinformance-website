/**
 * Slack alerts for crons that run overnight with nobody watching.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 17-08-2026 weekly-update-seed was cut off after 18 of 49 stores. It was
 * only noticed because somebody happened to look. That run now fails visibly
 * (the end check throws, the route returns 500), but a 500 in the Vercel logs
 * is still something a person has to go and find. This goes after them.
 *
 * CONFIGURATION
 * -------------
 * One env var: SLACK_ALERT_WEBHOOK, a Slack Incoming Webhook URL. The channel
 * is baked into that URL, so there is nothing else to configure.
 *
 * With the var unset -- locally, in preview -- nothing is sent and one line
 * goes to the console. That way a local run needs no secret, and a test can
 * never post into the channel by accident.
 *
 * THIS MUST NEVER TAKE DOWN A RUN
 * -------------------------------
 * A broken alert is annoying; a cron that dies BECAUSE the alert could not be
 * delivered is worse -- then you lose the run that did work. Everything below
 * catches its own errors and returns `false` rather than throwing. The caller
 * does not have to check the result.
 */

/** How long we wait for Slack at most. Short: this hangs off a cron timeout. */
const SLACK_TIMEOUT_MS = 5_000;

export interface CronAlert {
  /** Name of the cron, e.g. 'weekly-update-seed'. */
  cron: string;
  /** One line saying what is wrong. */
  message: string;
  /** Optional: the underlying error. */
  error?: unknown;
  /**
   * 'failed'    -- the whole run fell over (default).
   * 'attention' -- the run finished, but part of it did not.
   *
   * The distinction is there so the heading in Slack is true: "Cron failed"
   * above a run that did fill 46 of 49 stores reads as an outage it is not,
   * and that is how a channel gets ignored.
   */
  level?: "failed" | "attention";
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
 * Post an alert to Slack. Returns `true` if the message went out, `false` if
 * no webhook is configured or Slack did not cooperate. Never throws.
 */
export async function alertCronFailure(alert: CronAlert): Promise<boolean> {
  const webhook = process.env.SLACK_ALERT_WEBHOOK;
  if (!webhook) {
    console.warn(
      `[alerts] SLACK_ALERT_WEBHOOK not set -- no Slack message for ${alert.cron}: ${alert.message}`
    );
    return false;
  }

  const detail = describeError(alert.error);
  const heading =
    alert.level === "attention"
      ? `:warning: *Needs a look: ${alert.cron}*`
      : `:rotating_light: *Cron failed: ${alert.cron}*`;
  const text = [
    heading,
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
      // Slack answers in plain text ('invalid_token', 'no_service'), not JSON.
      const body = await resp.text().catch(() => "");
      console.error(
        `[alerts] Slack rejected the message for ${alert.cron}: HTTP ${resp.status} ${body}`.trim()
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(
      `[alerts] Slack message for ${alert.cron} failed:`,
      e instanceof Error ? e.message : e
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
