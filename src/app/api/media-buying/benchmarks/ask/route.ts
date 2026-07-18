/**
 * POST /api/media-buying/benchmarks/ask
 *
 * Body: { question: string; history?: { role: "user"|"assistant"; content: string }[] }
 *
 * Answers benchmark questions using Claude, with a compact per-store snapshot
 * table injected as context. Non-streaming for simplicity.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/ai/client";
import { buildAiContextTable } from "@/lib/media-buying/benchmark-query";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_HISTORY = 10;

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

function isTurn(v: unknown): v is HistoryTurn {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") && typeof o.content === "string"
  );
}

function formatTable(rows: Awaited<ReturnType<typeof buildAiContextTable>>["rows"]): string {
  // One line per store — deterministic, compact, easy for Claude to reason over.
  const fmt = (n: number | null | undefined, digits = 2) =>
    n == null ? "—" : Number(n).toFixed(digits);
  const fmtInt = (n: number) => Math.round(n).toString();
  return rows
    .map((r) => {
      return [
        `store="${r.store}"`,
        `dept=${r.department ?? "—"}`,
        `niche=${r.niche ?? "—"}`,
        `country=${r.country ?? "—"}`,
        `buyer=${r.media_buyer ?? "—"}`,
        `ber=${fmt(r.ber, 2)}x`,
        `invoice=${fmt(r.invoice_roas, 2)}x`,
        `spend=$${fmtInt(r.spend)}`,
        `revenue=$${fmtInt(r.revenue)}`,
        `conv=${fmtInt(r.conversions)}`,
        `imp=${fmtInt(r.impressions)}`,
        `clicks=${fmtInt(r.clicks)}`,
        `roas=${fmt(r.roas, 2)}x`,
        `cpm=$${fmt(r.cpm, 2)}`,
        `cpc=$${fmt(r.cpc, 2)}`,
        `ctr=${fmt(r.ctr, 2)}%`,
        `cpa=$${fmt(r.cpa, 2)}`,
      ].join(" ");
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPHIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }
  const history: HistoryTurn[] = Array.isArray(b.history)
    ? (b.history as unknown[]).filter(isTurn).slice(-MAX_HISTORY)
    : [];

  try {
    const context = await buildAiContextTable(supabase, 30);
    const systemPrompt = [
      "You are a Pinterest media-buying benchmark analyst for Pinformance.",
      "The user is the head of media buying. Answer their question about the",
      "per-store table below. Rules:",
      "  - Be concise (2–4 sentences unless a list is genuinely clearer).",
      "  - Use numbers with units (e.g. '2.87x ROAS', '$4.20 CPC', '1.8% CTR').",
      "  - When averaging across stores for ratio KPIs (ROAS, CPM, CPC, CTR, CPA),",
      "    use spend-weighted averages, not a plain mean — the user cares about",
      "    portfolio impact, not micro-store noise.",
      "  - If the filter would yield fewer than 3 stores, say so — anything less",
      "    is not a trustworthy benchmark.",
      "  - Never invent numbers not derivable from the table below.",
      "  - If you can't answer from this data, say so and suggest what would help.",
      "",
      `Window: ${context.window.start} to ${context.window.end} (${context.window.days}-day totals per store).`,
      `Stores in scope: ${context.rows.length}.`,
      "",
      "Per-store table:",
      formatTable(context.rows),
    ].join("\n");

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user" as const, content: question },
      ],
    });

    const answer =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return NextResponse.json({
      answer,
      window: context.window,
      n_stores: context.rows.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
