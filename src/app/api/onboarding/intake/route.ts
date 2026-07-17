import { NextResponse } from "next/server";

/**
 * Receives the intake form data from /onboarding and forwards it to the
 * linked Google Form endpoint. Google Forms auto-appends the row to the
 * connected Google Sheet, and an existing Zapier zap picks up the new row
 * and posts it into the internal Slack channel. Nothing to do here beyond
 * forwarding to Google Forms — the rest is handled downstream.
 */

export const runtime = "nodejs";

interface Body {
  entries: Record<string, string>;   // { "entry.123...": "value" }
  formResponseUrl: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entries, formResponseUrl } = body;
  if (!formResponseUrl || !entries) {
    return NextResponse.json({ error: "Missing formResponseUrl or entries" }, { status: 400 });
  }

  try {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(entries)) form.append(k, v);

    // Google Forms responds with a 200 (or occasionally a redirect) on success
    // and stores the row in the linked Sheet regardless.
    const gResp = await fetch(formResponseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!gResp.ok && gResp.status !== 0) {
      return NextResponse.json(
        { ok: false, error: `google-form-status-${gResp.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Google Form submit failed", e);
    return NextResponse.json({ ok: false, error: "google-form-fetch-failed" }, { status: 502 });
  }
}
