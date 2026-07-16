import { NextResponse } from "next/server";

/**
 * Receives the intake form data from /onboarding, forwards it to:
 *  1. The linked Google Form endpoint (which auto-appends to Google Sheets)
 *  2. The Slack Incoming Webhook (internal channel)
 *
 * Env var required in Vercel:
 *   SLACK_ONBOARDING_WEBHOOK_URL
 */

export const runtime = "nodejs";

interface Body {
  entries: Record<string, string>;   // { "entry.123...": "value" }
  labelled: Record<string, string>;  // { "Naam van je merk": "Celestia" }
  formResponseUrl: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entries, labelled, formResponseUrl } = body;
  if (!formResponseUrl || !entries) {
    return NextResponse.json({ error: "Missing formResponseUrl or entries" }, { status: 400 });
  }

  const errors: string[] = [];

  // 1) Google Form submission — CORS-open endpoint, POST form-encoded
  try {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(entries)) form.append(k, v);
    const gResp = await fetch(formResponseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    // Google Forms responds with 200 (accepted) or occasionally 400/redirect — either way the row is stored.
    if (!gResp.ok && gResp.status !== 0) {
      errors.push(`google-form-status-${gResp.status}`);
    }
  } catch (e) {
    errors.push("google-form-fetch-failed");
    console.error("Google Form submit failed", e);
  }

  // 2) Slack notification
  const webhookUrl = process.env.SLACK_ONBOARDING_WEBHOOK_URL;
  if (!webhookUrl) {
    errors.push("slack-webhook-not-configured");
  } else {
    try {
      const lines = Object.entries(labelled ?? {})
        .map(([label, value]) => `*${label}:* ${value || "_(empty)_"}`)
        .join("\n");
      const slackPayload = {
        text: "📥 New onboarding intake submitted",
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "📥 New onboarding intake" },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: lines || "(no data)" },
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: `Submitted via onboarding.pinformance-agency.com · ${new Date().toISOString()}` },
            ],
          },
        ],
      };
      const sResp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });
      if (!sResp.ok) errors.push(`slack-status-${sResp.status}`);
    } catch (e) {
      errors.push("slack-fetch-failed");
      console.error("Slack notification failed", e);
    }
  }

  // We treat the Google Form save as the primary source of truth.
  // If Slack fails but Sheets went through, we still return 200 so the client can proceed.
  const googleFormFailed = errors.some((e) => e.startsWith("google-form"));
  if (googleFormFailed) {
    return NextResponse.json({ ok: false, errors }, { status: 502 });
  }
  return NextResponse.json({ ok: true, warnings: errors });
}
