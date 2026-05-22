/**
 * Help Center capability registry.
 *
 * Each capability is one "thing the in-app Help Center is allowed to do
 * on its own" — the natural-language admin prompt is mapped (by Claude
 * via tool_use) to exactly one capability + typed params. Anything that
 * doesn't match a capability is reported back to the admin as
 * "requires the developer" — no free-form SQL, no code generation.
 *
 * To add a new capability:
 *   1. Define the Zod schema for its params here.
 *   2. Write the handler — read current value, write new value, return
 *      { before, after, summary }.
 *   3. Add the entry to CAPABILITY_REGISTRY.
 *   The orchestrator picks it up automatically.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CapabilityResult {
  /** Old value (for audit log + potential rollback). */
  before: unknown;
  /** New value after the change. */
  after: unknown;
  /** Human-readable confirmation message shown to the admin. */
  summary: string;
}

export interface CapabilityContext {
  admin: SupabaseClient;
  orgId: string;
}

export interface Capability<TParams> {
  name: string;
  /** Plain-English description used in the Claude tool_use schema. */
  description: string;
  /** Zod schema validating the params Claude returns. */
  schema: z.ZodType<TParams>;
  /** JSON Schema (Claude's tool_use input_schema). Built from the Zod schema. */
  jsonSchema: Record<string, unknown>;
  /** Handler — runs the actual mutation. */
  handler: (ctx: CapabilityContext, params: TParams) => Promise<CapabilityResult>;
}

// ─────────────────────────────────────────────────────────────────────────
// Helper: fetch current brand_profiles row (or default-empty one).
// ─────────────────────────────────────────────────────────────────────────
async function getBrandProfile(ctx: CapabilityContext) {
  const { data } = await ctx.admin
    .from("brand_profiles")
    .select("*")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  return (
    data ?? {
      org_id: ctx.orgId,
      brand_voice: null,
      target_audience: null,
      unique_selling_points: [] as string[],
      color_palette: [] as string[],
      font_preferences: [] as string[],
      tone_keywords: [] as string[],
      avoid_keywords: [] as string[],
      raw_data: {} as Record<string, unknown>,
    }
  );
}

async function upsertBrandProfile(
  ctx: CapabilityContext,
  patch: Record<string, unknown>
) {
  await ctx.admin
    .from("brand_profiles")
    .upsert(
      { org_id: ctx.orgId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "org_id" }
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Capability definitions
// ─────────────────────────────────────────────────────────────────────────

const updateOrgName: Capability<{ new_name: string }> = {
  name: "update_org_name",
  description:
    "Update the organization's display name. Use this for fixing brand name typos (e.g. 'Tobios Kids' should be 'Tobio's Kids') or for renaming a client account.",
  schema: z.object({ new_name: z.string().min(1).max(120) }),
  jsonSchema: {
    type: "object",
    properties: {
      new_name: { type: "string", description: "The corrected organization name." },
    },
    required: ["new_name"],
  },
  handler: async (ctx, { new_name }) => {
    const { data: before } = await ctx.admin
      .from("organizations")
      .select("name")
      .eq("id", ctx.orgId)
      .single();
    await ctx.admin
      .from("organizations")
      .update({ name: new_name, updated_at: new Date().toISOString() })
      .eq("id", ctx.orgId);
    return {
      before: { name: before?.name ?? null },
      after: { name: new_name },
      summary: `Organization name updated from "${before?.name ?? "(empty)"}" to "${new_name}".`,
    };
  },
};

const updateBrandVoice: Capability<{ brand_voice: string }> = {
  name: "update_brand_voice",
  description:
    "Set the brand voice / tone description used by the AI when generating Pin content and reports. Free-form text (e.g. 'luxe & professioneel', 'friendly + playful').",
  schema: z.object({ brand_voice: z.string().min(1).max(500) }),
  jsonSchema: {
    type: "object",
    properties: {
      brand_voice: { type: "string", description: "The new brand voice description." },
    },
    required: ["brand_voice"],
  },
  handler: async (ctx, { brand_voice }) => {
    const current = await getBrandProfile(ctx);
    await upsertBrandProfile(ctx, { brand_voice });
    return {
      before: { brand_voice: current.brand_voice },
      after: { brand_voice },
      summary: `Brand voice updated to "${brand_voice}".`,
    };
  },
};

const updateTargetAudience: Capability<{ target_audience: string }> = {
  name: "update_target_audience",
  description:
    "Set the target audience description used by the AI. Free-form text (e.g. 'Vrouwen 25-45 met interesse in luxury fashion').",
  schema: z.object({ target_audience: z.string().min(1).max(1000) }),
  jsonSchema: {
    type: "object",
    properties: {
      target_audience: { type: "string", description: "The new target audience description." },
    },
    required: ["target_audience"],
  },
  handler: async (ctx, { target_audience }) => {
    const current = await getBrandProfile(ctx);
    await upsertBrandProfile(ctx, { target_audience });
    return {
      before: { target_audience: current.target_audience },
      after: { target_audience },
      summary: `Target audience updated.`,
    };
  },
};

const replaceUsps: Capability<{ unique_selling_points: string[] }> = {
  name: "replace_unique_selling_points",
  description:
    "Replace the full list of unique selling points for the brand. Use when the admin wants to overwrite the entire USP list (e.g. 'Set USPs to Made in EU, Lifetime warranty, Free returns').",
  schema: z.object({
    unique_selling_points: z.array(z.string().min(1).max(200)).max(20),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      unique_selling_points: {
        type: "array",
        items: { type: "string" },
        description: "The full new list of USPs (replaces existing list).",
      },
    },
    required: ["unique_selling_points"],
  },
  handler: async (ctx, { unique_selling_points }) => {
    const current = await getBrandProfile(ctx);
    await upsertBrandProfile(ctx, { unique_selling_points });
    return {
      before: { unique_selling_points: current.unique_selling_points },
      after: { unique_selling_points },
      summary: `USPs replaced with ${unique_selling_points.length} item${unique_selling_points.length === 1 ? "" : "s"}: ${unique_selling_points.join(", ")}.`,
    };
  },
};

const addUsp: Capability<{ usp: string }> = {
  name: "add_unique_selling_point",
  description:
    "Append a single unique selling point to the existing list (e.g. 'Add Made in EU as a USP'). Use this when the admin asks to ADD a USP, not replace all.",
  schema: z.object({ usp: z.string().min(1).max(200) }),
  jsonSchema: {
    type: "object",
    properties: {
      usp: { type: "string", description: "The new USP to add." },
    },
    required: ["usp"],
  },
  handler: async (ctx, { usp }) => {
    const current = await getBrandProfile(ctx);
    const before = current.unique_selling_points ?? [];
    if (before.includes(usp)) {
      return {
        before: { unique_selling_points: before },
        after: { unique_selling_points: before },
        summary: `USP "${usp}" was already in the list — nothing changed.`,
      };
    }
    const next = [...before, usp];
    await upsertBrandProfile(ctx, { unique_selling_points: next });
    return {
      before: { unique_selling_points: before },
      after: { unique_selling_points: next },
      summary: `Added USP: "${usp}".`,
    };
  },
};

const updateBrandColors: Capability<{ color_palette: string[] }> = {
  name: "update_brand_colors",
  description:
    "Replace the brand color palette. Accepts hex colors like #FF6B00 (max 6 colors).",
  schema: z.object({
    color_palette: z
      .array(
        z
          .string()
          .regex(/^#[0-9A-Fa-f]{3,8}$/, "Must be a hex color like #FF6B00")
      )
      .max(6),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      color_palette: {
        type: "array",
        items: { type: "string", description: "Hex color like #FF6B00" },
        description: "The new color palette (hex format).",
      },
    },
    required: ["color_palette"],
  },
  handler: async (ctx, { color_palette }) => {
    const current = await getBrandProfile(ctx);
    await upsertBrandProfile(ctx, { color_palette });
    return {
      before: { color_palette: current.color_palette },
      after: { color_palette },
      summary: `Brand colors updated to ${color_palette.join(", ")}.`,
    };
  },
};

const updateToneKeywords: Capability<{ tone_keywords: string[] }> = {
  name: "update_tone_keywords",
  description:
    "Replace the list of tone keywords — words the AI should favor when generating content for this brand.",
  schema: z.object({
    tone_keywords: z.array(z.string().min(1).max(60)).max(30),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      tone_keywords: {
        type: "array",
        items: { type: "string" },
        description: "Words the AI should favor.",
      },
    },
    required: ["tone_keywords"],
  },
  handler: async (ctx, { tone_keywords }) => {
    const current = await getBrandProfile(ctx);
    await upsertBrandProfile(ctx, { tone_keywords });
    return {
      before: { tone_keywords: current.tone_keywords },
      after: { tone_keywords },
      summary: `Tone keywords updated (${tone_keywords.length} item${tone_keywords.length === 1 ? "" : "s"}).`,
    };
  },
};

const updateAvoidKeywords: Capability<{ avoid_keywords: string[] }> = {
  name: "update_avoid_keywords",
  description:
    "Replace the list of words the AI should AVOID when generating content for this brand.",
  schema: z.object({
    avoid_keywords: z.array(z.string().min(1).max(60)).max(30),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      avoid_keywords: {
        type: "array",
        items: { type: "string" },
        description: "Words the AI should avoid.",
      },
    },
    required: ["avoid_keywords"],
  },
  handler: async (ctx, { avoid_keywords }) => {
    const current = await getBrandProfile(ctx);
    await upsertBrandProfile(ctx, { avoid_keywords });
    return {
      before: { avoid_keywords: current.avoid_keywords },
      after: { avoid_keywords },
      summary: `Avoid-keywords updated (${avoid_keywords.length} item${avoid_keywords.length === 1 ? "" : "s"}).`,
    };
  },
};

const updateRawDataField: Capability<{ field: string; value: string }> = {
  name: "update_brand_raw_field",
  description:
    "Update a single free-form field on the brand profile (stored in raw_data). Use this for things like 'website', 'industry', 'description', 'pin_title_template', 'pin_description_template', 'default_landing_page'. Avoid using this for fields that have a dedicated capability above.",
  schema: z.object({
    field: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z][a-z0-9_]*$/, "Field key must be snake_case"),
    value: z.string().max(2000),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      field: {
        type: "string",
        description:
          "snake_case field name (e.g. website, description, pin_title_template, default_landing_page).",
      },
      value: { type: "string", description: "The new value." },
    },
    required: ["field", "value"],
  },
  handler: async (ctx, { field, value }) => {
    const current = await getBrandProfile(ctx);
    const raw = (current.raw_data ?? {}) as Record<string, unknown>;
    const before = raw[field];
    const next = { ...raw, [field]: value };
    await upsertBrandProfile(ctx, { raw_data: next });
    return {
      before: { [field]: before ?? null },
      after: { [field]: value },
      summary: `Updated ${field} to "${value.length > 60 ? value.slice(0, 60) + "…" : value}".`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Public registry — orchestrator iterates over this.
// ─────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CAPABILITY_REGISTRY: Capability<any>[] = [
  updateOrgName,
  updateBrandVoice,
  updateTargetAudience,
  replaceUsps,
  addUsp,
  updateBrandColors,
  updateToneKeywords,
  updateAvoidKeywords,
  updateRawDataField,
];

export function getCapability(name: string): Capability<unknown> | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.name === name) as
    | Capability<unknown>
    | undefined;
}
