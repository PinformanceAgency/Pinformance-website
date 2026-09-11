/**
 * POST /api/organic/creative/<orgId> — Johanne's Creative Machine (a test).
 * One endpoint dispatched by `action`, like the phase routes. See
 * src/lib/organic/creative-machine.ts for what each step is and why.
 */
import { NextResponse } from "next/server";
import * as CM from "@/lib/organic/creative-machine";

export const runtime = "nodejs";
// Claude reads up to ten images per call and writes up to ninety scenarios.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const body = (await req.json()) as { action: string } & Record<string, unknown>;
  try {
    return NextResponse.json({ ok: true, ...(await dispatch(orgId, body)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

async function dispatch(orgId: string, b: { action: string } & Record<string, unknown>) {
  const campaign = (b.campaign_id as string | null) ?? null;
  switch (b.action) {
    case "load":            return CM.loadCreativeMachine(orgId);
    case "save_brief":      return CM.saveBrief(orgId, b.brief as CM.CreativeBrief);
    case "add_image":       return CM.addImage(orgId, b.kind as "brand" | "inspiration" | "product", campaign, String(b.base64));
    case "remove_image":    return CM.removeImage(orgId, b.kind as "brand" | "inspiration" | "product", campaign, String(b.url));
    case "analyze_brand":   return CM.analyzeBrand(orgId, (b.adjustment as string | null) ?? null);
    case "new_campaign":    return CM.newCampaign(orgId, String(b.name ?? ""));
    case "delete_campaign": return CM.deleteCampaign(orgId, String(campaign));
    case "analyze_inspiration": return CM.analyzeInspiration(orgId, String(campaign));
    case "save_config":     return CM.saveConfig(orgId, String(campaign), b.config as CM.ScenarioConfig);
    case "generate_scenarios":  return CM.generateScenarios(orgId, String(campaign));
    case "scenario_prompt": return CM.scenarioPrompt(orgId, String(campaign), String(b.scenario), !!b.mark_used);
    case "set_used":        return CM.setScenarioUsed(orgId, String(campaign), String(b.scenario_id), !!b.used);
    default: throw new Error(`Unknown action: ${b.action}`);
  }
}
