/**
 * Run rows and settings. Supabase JS with the service role — the same client
 * Store Ranking takes, and deliberately not a pg pool: the session pooler
 * allows 15 clients for the whole project (see CLAUDE.md).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LEASE_MS, STAGES, type Stage, type Stream } from "./constants";
import type { RunPayload, RunRow } from "./types";

let client: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export const stageIndex = (s: Stage) => STAGES.indexOf(s);

export async function getRun(meetingDate: string, stream: Stream): Promise<RunRow | null> {
  const { data, error } = await adminClient()
    .from("delivery_meeting_runs")
    .select("*")
    .eq("meeting_date", meetingDate)
    .eq("stream", stream)
    .maybeSingle();
  if (error) throw new Error(`delivery_meeting_runs: ${error.message}`);
  return (data as RunRow) ?? null;
}

/** Create the row, or reset it to `collect` with an empty payload. */
export async function resetRun(meetingDate: string, stream: Stream, payload: RunPayload): Promise<RunRow> {
  const { data, error } = await adminClient()
    .from("delivery_meeting_runs")
    .upsert(
      {
        meeting_date: meetingDate,
        stream,
        stage: "collect",
        status: "pending",
        error: null,
        attempts: 0,
        locked_until: null,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "meeting_date,stream" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`delivery_meeting_runs: ${error.message}`);
  return data as RunRow;
}

/**
 * Take the run for this invocation. Two invocations can overlap (a tick that
 * runs long and the next one, or a manual run), and two writers on
 * one payload means the second silently drops the first one's work. So a run
 * is held under a lease; a crashed invocation frees it when the lease passes.
 * Returns null when somebody else holds it.
 */
export async function claimRun(meetingDate: string, stream: Stream): Promise<RunRow | null> {
  const now = new Date();
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const { data, error } = await adminClient()
    .from("delivery_meeting_runs")
    .update({ locked_until: until })
    .eq("meeting_date", meetingDate)
    .eq("stream", stream)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select("*");
  if (error) throw new Error(`delivery_meeting_runs: ${error.message}`);
  return ((data ?? [])[0] as RunRow) ?? null;
}

export async function saveRun(
  run: RunRow,
  patch: Partial<Pick<RunRow, "stage" | "status" | "error" | "attempts" | "payload">>,
  release = false,
): Promise<RunRow> {
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (release) update.locked_until = null;
  const { data, error } = await adminClient()
    .from("delivery_meeting_runs")
    .update(update)
    .eq("id", run.id)
    .select("*")
    .single();
  if (error) throw new Error(`delivery_meeting_runs: ${error.message}`);
  return data as RunRow;
}

export async function releaseRun(run: RunRow): Promise<void> {
  await adminClient().from("delivery_meeting_runs").update({ locked_until: null }).eq("id", run.id);
}

export interface BuyerRow {
  buyer: string;
  stream: Stream;
  monthly_target_on_track: number;
  monday_user_id: number | null;
  slack_label: string | null;
}

export interface MeetingSettingsRow {
  org_id: string;
  display_name: string | null;
  weekly_goal: boolean;
  revenue_multiplier: number;
  blend_group: string | null;
  monday_weekly_update_ids: string[];
  monday_store_name: string | null;
  monday_aliases: string[];
}

export async function loadBuyers(): Promise<BuyerRow[]> {
  const { data, error } = await adminClient().from("delivery_meeting_buyers").select("*");
  if (error) throw new Error(`delivery_meeting_buyers: ${error.message}`);
  return (data ?? []) as BuyerRow[];
}

export async function loadMeetingSettings(): Promise<Map<string, MeetingSettingsRow>> {
  const { data, error } = await adminClient().from("delivery_meeting_settings").select("*");
  if (error) throw new Error(`delivery_meeting_settings: ${error.message}`);
  return new Map(
    ((data ?? []) as MeetingSettingsRow[]).map((r) => [
      r.org_id,
      { ...r, revenue_multiplier: Number(r.revenue_multiplier ?? 1) },
    ]),
  );
}

export async function uploadFile(path: string, body: Buffer | Uint8Array, contentType: string) {
  const { error } = await adminClient()
    .storage.from("delivery-meeting")
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`storage upload ${path}: ${error.message}`);
}

export async function downloadFile(path: string): Promise<Buffer> {
  const { data, error } = await adminClient().storage.from("delivery-meeting").download(path);
  if (error || !data) throw new Error(`storage download ${path}: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}
