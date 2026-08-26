import { NextResponse } from "next/server";
import { saveTaskAnswer, clearTaskAnswerField, loadTaskAnswers, syncTaskStatusFromAnswers } from "@/lib/organic/workspace";
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
  more_than_5_products: "more_than_5_products",
  url_volume: "url_volume",
  existing_assets: "existing_assets",
  rf_single_landing: "rf_single_landing",
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
  // The rating and its reasoning, in one statement.
  //
  // These used to be two branches with a `return` between them, so a request
  // carrying both wrote the rating and silently dropped the rationale. The UI
  // happens to send them separately — click the rating, then save the
  // reasoning — which is the only reason it was never noticed. COALESCE keeps
  // whichever half is absent from blanking what is already stored.
  if (fieldKey === "verdict" && (body.answer_text || body.evidence)) {
    await pool.query(
      `INSERT INTO organic.client_viability (org_id, verdict, rationale, assessed_at)
       VALUES ($1, $2::organic.viability_verdict, $3, now())
       ON CONFLICT (org_id) DO UPDATE SET
         verdict   = COALESCE(EXCLUDED.verdict,   organic.client_viability.verdict),
         rationale = COALESCE(EXCLUDED.rationale, organic.client_viability.rationale),
         assessed_at = now()`,
      [orgId, body.answer_text ?? null, body.evidence ?? null]
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
      // Clearing an answer can un-finish the task, same as answering can
      // finish it. Deriving in one direction only would leave a task
      // sitting at DONE with an empty question on it.
      const status = await syncTaskStatusFromAnswers(orgId, body.task_id);
      return NextResponse.json({ ok: true, cleared: body.clear, status });
    }

    await saveTaskAnswer(orgId, body);
    await mirrorToViability(orgId, body.field_key, body);

    // A link is a document wherever it was typed — in the reasoning, or in
    // the attachment box on the question itself. Both are captured into the
    // library, so the library view stays complete without anybody having to
    // file the same thing a second time.
    const linkText = [body.evidence, body.file_url].filter(Boolean).join(" ");
    const captured = linkText
      ? await autoLinkAssetsFromText(orgId, body.task_id, linkText)
      : [];

    // The task closes itself once every visible question is answered. See
    // syncTaskStatusFromAnswers.
    const status = await syncTaskStatusFromAnswers(orgId, body.task_id);

    return NextResponse.json({ ok: true, assets_captured: captured.length, status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
