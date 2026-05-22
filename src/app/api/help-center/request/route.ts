/**
 * Help Center request endpoint.
 *
 * Flow per POST:
 *   1. Verify caller is an agency_admin (client_admins are blocked at
 *      both the UI nav and here, defensively).
 *   2. Build a small brand-profile context snapshot to give Claude
 *      enough grounding to interpret the prompt.
 *   3. Call the orchestrator → returns one of:
 *      - apply (capability + params)  → dispatch handler, audit row
 *      - answer (message)              → relay, audit row
 *      - unsupported (reason)          → relay "developer needed",
 *                                        audit row
 *   4. Return the user-facing response + a type so the UI can style.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import { orchestrate } from "@/lib/help-center/orchestrator";
import { getCapability } from "@/lib/help-center/capabilities";

interface RequestBody {
  prompt: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, org_id, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  // Help Center is agency_admin only — by explicit user requirement.
  if (profile.role !== "agency_admin") {
    return NextResponse.json(
      { error: "Help Center is only available to agency admins." },
      { status: 403 }
    );
  }

  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) {
    return NextResponse.json(
      { error: "No active organization selected." },
      { status: 400 }
    );
  }

  const body = (await request.json()) as RequestBody;
  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "Empty prompt." },
      { status: 400 }
    );
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "Prompt too long (max 2000 chars)." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Brand profile snapshot for context.
  const [{ data: org }, { data: brand }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).single(),
    admin.from("brand_profiles").select("*").eq("org_id", orgId).maybeSingle(),
  ]);
  const brandSummary = brand
    ? [
        `brand_voice: ${brand.brand_voice || "(empty)"}`,
        `target_audience: ${brand.target_audience || "(empty)"}`,
        `unique_selling_points: ${
          (brand.unique_selling_points || []).join(", ") || "(empty)"
        }`,
        `color_palette: ${(brand.color_palette || []).join(", ") || "(empty)"}`,
        `tone_keywords: ${(brand.tone_keywords || []).join(", ") || "(empty)"}`,
        `avoid_keywords: ${(brand.avoid_keywords || []).join(", ") || "(empty)"}`,
      ].join("\n")
    : "(no brand profile yet)";

  let result;
  try {
    result = await orchestrate(prompt, {
      orgName: org?.name || "(unknown)",
      brandSummary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: `Error contacting the AI service: ${msg}`,
      type: "error",
    });
    return NextResponse.json({
      type: "error",
      message: "The AI service could not be reached. Please try again.",
    });
  }

  if (result.kind === "answer") {
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: result.message,
      type: "answer",
    });
    return NextResponse.json({ type: "answer", message: result.message });
  }

  if (result.kind === "unsupported") {
    const msg =
      "This change isn't available in the Help Center. It needs the developer — please reach out to them directly." +
      (result.reason ? `\n\nReason: ${result.reason}` : "");
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: msg,
      type: "unsupported",
    });
    return NextResponse.json({
      type: "unsupported",
      message: msg,
      reason: result.reason,
    });
  }

  // result.kind === "apply"
  const capability = getCapability(result.capability);
  if (!capability) {
    const msg = `Unknown capability "${result.capability}" returned by the AI. Logged for review.`;
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: msg,
      type: "error",
      capability: result.capability,
    });
    return NextResponse.json({ type: "error", message: msg });
  }
  // Validate params against the capability's Zod schema before running.
  const parsed = capability.schema.safeParse(result.params);
  if (!parsed.success) {
    const msg = `The AI returned invalid parameters for "${capability.name}". The change was not applied.\nValidation error: ${parsed.error.message}`;
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: msg,
      type: "error",
      capability: capability.name,
    });
    return NextResponse.json({ type: "error", message: msg });
  }

  try {
    const outcome = await capability.handler(
      { admin, orgId },
      parsed.data
    );
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: outcome.summary,
      type: "apply",
      capability: capability.name,
      before_value: outcome.before,
      after_value: outcome.after,
    });
    return NextResponse.json({
      type: "apply",
      message: outcome.summary,
      capability: capability.name,
      before: outcome.before,
      after: outcome.after,
    });
  } catch (err) {
    const msg = `Failed to apply "${capability.name}": ${err instanceof Error ? err.message : String(err)}`;
    await admin.from("help_requests").insert({
      org_id: orgId,
      user_id: profile.id,
      prompt,
      response: msg,
      type: "error",
      capability: capability.name,
    });
    return NextResponse.json({ type: "error", message: msg });
  }
}
