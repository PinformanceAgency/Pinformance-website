/**
 * GET /api/media-buying/store-ranking?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Powers the Store Ranking page. Accepts a custom [start, end] date range
 * (inclusive, UTC). Returns configured + active stores with their
 * spend/revenue/ROAS/zone for that range.
 *
 * Defaults: end = yesterday, start = end - 6 days (last 7 days).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeStoreRankingForRange } from "@/lib/media-buying/store-ranking";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: string | null): boolean {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime());
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  // Defaults: last 7 days ending yesterday.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const defaultEnd = isoDate(yesterday);
  const defaultStart = isoDate(
    new Date(yesterday.getTime() - 6 * 24 * 3600 * 1000)
  );

  let start = isValidDate(startParam) ? (startParam as string) : defaultStart;
  let end = isValidDate(endParam) ? (endParam as string) : defaultEnd;

  // Ensure start <= end — swap if user picked the wrong order.
  if (start > end) [start, end] = [end, start];

  try {
    const stores = await computeStoreRankingForRange(supabase, start, end);
    return NextResponse.json({ start, end, stores });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
