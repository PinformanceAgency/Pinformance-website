import { NextResponse } from "next/server";
import { saveTaskAnswer, clearTaskAnswerField, loadTaskAnswers } from "@/lib/organic/workspace";
import { autoLinkAssetsFromText } from "@/lib/organic/assets-auto";
import { organicPool } from "@/lib/organic/db";

/**
 * The viability gate reads organic.client_viability, not task_answers —
 * P1.0.4 blocks the whole of phase 1 on it. So the four gate tasks mirror
 * their answers through to that table as well as storing the reasoning
 * here. Without this the new form would look like it worked and the gate
 * would never open.
 */
const VIABILITY_COLUMNS: Record<string, string> = {
  visual_first: "visual_first",
  more_than_5_products: "more_than_5_products",
  url_volume: "url_volume",
  high_aov: "high_aov",
  existing_assets: "existing_assets",
  longterm_mindset: "longterm_mindset",
  rf_technical_b2b: "rf_technical_b2b",
  rf_local_only: "rf_local_only",
  rf_single_landing: "rf_single_landing",
  rf_needs_sales_now: "rf_needs_sales_now",
  rf_low_effort_ds: "rf_low_effort_ds",
  rf_restricted_niche: "rf_restricted_niche",
};

async function mirrorToViability(
  orgId: string, fieldKey: string,
  body: { answer_bool?: boolean | null; answer_number?: number | null; answer_text?: string | null; evidence?: string | null }
) {
  const pool = organicPool();
  const col = VIABILITY_COLUMNS[fieldKey];

  if (col && typeof body.answer_bool === "boolean") {
    await pool.query(
      `INSERT INTO organic.client_viability (org_id, ${col}, assessed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (org_id) DO UPDATE SET ${col} = EXCLUDED.${col}, assessed_at = now()`,
      [orgId, body.answer_bool]
    );
    return;
  }
  if (fieldKey === "total_urls_found" && body.answer_number != null) {
    await pool.query(
      `INSERT INTO organic.client_viability (org_id, total_urls_found, assessed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (org_id) DO UPDATE SET total_urls_found = EXCLUDED.total_urls_found, assessed_at = now()`,
      [orgId, Math.round(body.answer_number)]
    );
    return;
  }
  if (fieldKey === "verdict" && body.answer_text) {
    await pool.query(
      `INSERT INTO organic.client_viability (org_id, verdict, assessed_at)
       VALUES ($1, $2::organic.viability_verdict, now())
       ON CONFLICT (org_id) DO UPDATE SET verdict = EXCLUDED.verdict, assessed_at = now()`,
      [orgId, body.answer_text]
    );
    return;
  }
  // The written reasoning on the verdict is the rationale the gate stores.
  if (fieldKey === "verdict" && body.evidence) {
    await pool.query(
      `UPDATE organic.client_viability SET rationale = $2 WHERE org_id = $1`,
      [orgId, body.evidence]
    );
  }
}

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    return NextResponse.json({ ok: true, answers: await loadTaskAnswers(orgId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    const body = await req.json();
    if (!body?.task_id || !body?.field_key) {
      return NextResponse.json({ error: "task_id and field_key are required" }, { status: 400 });
    }

    // An explicit clear, since the upsert COALESCEs and cannot blank a value.
    if (body.clear) {
      await clearTaskAnswerField(orgId, body.task_id, body.field_key, body.clear);
      return NextResponse.json({ ok: true, cleared: body.clear });
    }

    await saveTaskAnswer(orgId, body);
    await mirrorToViability(orgId, body.field_key, body);

    // A link pasted into the reasoning is still a document. Capture it the
    // same way notes and completions do, so it lands in the library rather
    // than being buried in a paragraph.
    const captured = body.evidence
      ? await autoLinkAssetsFromText(orgId, body.task_id, String(body.evidence))
      : [];

    return NextResponse.json({ ok: true, assets_captured: captured.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
