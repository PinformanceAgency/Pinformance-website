/**
 * D — het merk, zoals het bij de klant vandaan komt.
 *
 * `organic.brand_rules` had de woordkant al: positionering, tone of voice,
 * verboden woorden, goedgekeurde CTA's, dominante kleuren. Wat er niet was, is
 * alles wat je aanlevert en vasthoudt — het logo, de fonts, het merkboek, de
 * drive met hun eigen beeldmateriaal. Zonder die dingen krijgt elke
 * gegenereerde pin een generiek font en een willekeurig palet, en dat is waar
 * de klacht "de creatives zijn te zwak" begint.
 *
 * Twee regels die hier gelden:
 *
 *   - **Een leeg merk is een meetbare toestand, geen fout.** Wat ontbreekt
 *     wordt bij naam genoemd — op de design brief, in het paneel en in
 *     `audit-research-links.ts` — in plaats van stil vervangen door een
 *     standaardwaarde. Iemand die wéét dat er geen merkboek is, werkt anders
 *     dan iemand die denkt dat het palet hieronder van het merk is.
 *   - **Bestanden gaan buiten de API om naar storage.** Een merkboek-PDF is
 *     zo tien megabyte en Vercel kapt een request body af op 4,5 MB. Zelfde
 *     patroon als de video-upload: de server tekent de plek, de browser zet
 *     het bestand er neer.
 */
import { organicPool } from "./db";

export interface BrandLogo {
  /** "on light", "on dark", "mark only" — hoe de ontwerper hem noemt. */
  variant: string;
  url: string;
  filename: string;
}

export interface BrandFont {
  name: string;
  /** Het bestand, als het merk een font gebruikt dat niet in Canva zit. */
  url?: string | null;
  /** "headlines", "body" — waar dit font voor is. */
  usage?: string | null;
}

export interface BrandAssets {
  org_id: string;
  positioning: string | null;
  tone_descriptors: string[];
  brand_pillars: string[];
  dominant_colors: string[];
  banned_words: string[];
  banned_topics: string[];
  never_include: string[];
  approved_ctas: string[];
  logos: BrandLogo[];
  fonts: BrandFont[];
  guidelines_url: string | null;
  guidelines_path: string | null;
  content_drive_url: string | null;
  guidelines_strict: boolean | null;
  brand_notes: string | null;
  /** Wat er ontbreekt, in de woorden van de ontwerper die het mist. */
  missing: string[];
  /** Hoeveel van de zes dingen die een pin on-brand maken er zijn. */
  completeness: { have: number; of: number };
}

/** node-pg geeft een text[] als array terug, maar een NULL als null. */
const arr = (v: string[] | null | undefined): string[] => (Array.isArray(v) ? v : []);

/**
 * Wat er van het merk vastligt, en wat niet.
 *
 * `missing` is het punt van deze functie. Het is dezelfde lijst die de design
 * brief onder `gaps` zet en die fase 4 als waarschuwing toont, zodat er één
 * antwoord bestaat op "wat weten we van dit merk" in plaats van drie schermen
 * die het los van elkaar afleiden.
 */
export async function loadBrandAssets(orgId: string): Promise<BrandAssets> {
  const r = await organicPool().query<{
    positioning: string | null;
    tone_descriptors: string[] | null;
    brand_pillars: string[] | null;
    dominant_colors: string[] | null;
    banned_words: string[] | null;
    banned_topics: string[] | null;
    never_include: string[] | null;
    approved_ctas: string[] | null;
    logos: BrandLogo[] | null;
    fonts: BrandFont[] | null;
    guidelines_url: string | null;
    guidelines_path: string | null;
    content_drive_url: string | null;
    guidelines_strict: boolean | null;
    brand_notes: string | null;
  }>(
    `SELECT positioning, tone_descriptors, brand_pillars, dominant_colors,
            banned_words, banned_topics, never_include, approved_ctas,
            logos, fonts, guidelines_url, guidelines_path, content_drive_url,
            guidelines_strict, brand_notes
       FROM organic.brand_rules WHERE org_id = $1`,
    [orgId]
  );
  const b = r.rows[0];

  const assets: BrandAssets = {
    org_id: orgId,
    positioning: b?.positioning ?? null,
    tone_descriptors: arr(b?.tone_descriptors),
    brand_pillars: arr(b?.brand_pillars),
    dominant_colors: arr(b?.dominant_colors),
    banned_words: arr(b?.banned_words),
    banned_topics: arr(b?.banned_topics),
    never_include: arr(b?.never_include),
    approved_ctas: arr(b?.approved_ctas),
    logos: Array.isArray(b?.logos) ? b.logos : [],
    fonts: Array.isArray(b?.fonts) ? b.fonts : [],
    guidelines_url: b?.guidelines_url ?? null,
    guidelines_path: b?.guidelines_path ?? null,
    content_drive_url: b?.content_drive_url ?? null,
    guidelines_strict: b?.guidelines_strict ?? null,
    brand_notes: b?.brand_notes ?? null,
    missing: [],
    completeness: { have: 0, of: 6 },
  };

  // De zes dingen die samen bepalen of een pin er van dit merk uitziet.
  // Genoemd in de volgorde waarin een ontwerper ze mist.
  const checks: Array<[boolean, string]> = [
    [assets.logos.length > 0, "no logo — every design is drawn without one"],
    [assets.fonts.length > 0, "no font recorded — the generated designs fall back to a generic one"],
    [assets.dominant_colors.length > 0, "no brand colours — the palette comes from the niche grid instead of the brand"],
    [assets.tone_descriptors.length > 0, "no tone of voice — the copy is written from the niche, not the brand"],
    [
      assets.guidelines_url != null || assets.guidelines_path != null,
      "no brand book — nothing to check a design against",
    ],
    [assets.content_drive_url != null, "no content drive — no source for the client's own imagery"],
  ];
  assets.missing = checks.filter(([ok]) => !ok).map(([, why]) => why);
  assets.completeness = { have: checks.filter(([ok]) => ok).length, of: checks.length };
  return assets;
}

export interface BrandAssetsInput {
  positioning?: string | null;
  tone_descriptors?: string[];
  brand_pillars?: string[];
  dominant_colors?: string[];
  banned_words?: string[];
  banned_topics?: string[];
  never_include?: string[];
  approved_ctas?: string[];
  logos?: BrandLogo[];
  fonts?: BrandFont[];
  guidelines_url?: string | null;
  content_drive_url?: string | null;
  guidelines_strict?: boolean | null;
  brand_notes?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Het merk vastleggen. Alleen wat is meegegeven wordt geschreven.
 *
 * Kleuren worden gecontroleerd op vorm, want een "donkerblauw" in deze kolom
 * belandt ongezien in een prompt en komt er als iets anders uit. De rest is
 * vrije tekst en moet dat ook blijven: "nooit modellen jonger dan 25" past in
 * geen enkel veld dat wij zouden bedenken.
 */
export async function saveBrandAssets(
  orgId: string, input: BrandAssetsInput
): Promise<{ ok: true; missing: string[] }> {
  const colors = input.dominant_colors?.map((c) => c.trim()).filter(Boolean);
  const bad = (colors ?? []).filter((c) => !HEX.test(c));
  if (bad.length > 0) {
    throw new Error(
      `${bad.join(", ")} ${bad.length === 1 ? "is not a hex colour" : "are not hex colours"} — ` +
      `use #RRGGBB, because this value goes into an image prompt as it stands`
    );
  }
  for (const l of input.logos ?? []) {
    if (!l.url?.trim() || !l.variant?.trim()) {
      throw new Error("A logo needs a variant name and a file — otherwise nobody knows which one this is");
    }
  }
  for (const f of input.fonts ?? []) {
    if (!f.name?.trim()) throw new Error("A font needs a name");
  }

  // De parameters staan zowel in de INSERT als in de DO UPDATE, en niet
  // EXCLUDED. Twee redenen, en ze bijten elkaar:
  //
  //   - `banned_words`, `approved_ctas`, `logos` en `fonts` zijn NOT NULL met
  //     een default. Een expliciete NULL in de INSERT overrulet die default en
  //     valt op de constraint, dus staat er COALESCE naar leeg.
  //   - Maar op de UPDATE mag "niet meegegeven" nooit "leegmaken" betekenen.
  //     Met EXCLUDED zou dat wél gebeuren: die is dan de lege array uit de
  //     regel hierboven. Door `$n` zelf te gebruiken blijft NULL "laat staan".
  await organicPool().query(
    `INSERT INTO organic.brand_rules (
       org_id, positioning, tone_descriptors, brand_pillars, dominant_colors,
       banned_words, banned_topics, never_include, approved_ctas,
       logos, fonts, guidelines_url, content_drive_url, guidelines_strict, brand_notes
     ) VALUES (
       $1, $2, $3, $4, $5,
       COALESCE($6, '{}'::text[]), $7, $8, COALESCE($9, '{}'::text[]),
       COALESCE($10::jsonb, '[]'::jsonb), COALESCE($11::jsonb, '[]'::jsonb),
       $12, $13, $14, $15
     )
     ON CONFLICT (org_id) DO UPDATE SET
       positioning       = COALESCE($2,  organic.brand_rules.positioning),
       tone_descriptors  = COALESCE($3,  organic.brand_rules.tone_descriptors),
       brand_pillars     = COALESCE($4,  organic.brand_rules.brand_pillars),
       dominant_colors   = COALESCE($5,  organic.brand_rules.dominant_colors),
       banned_words      = COALESCE($6,  organic.brand_rules.banned_words),
       banned_topics     = COALESCE($7,  organic.brand_rules.banned_topics),
       never_include     = COALESCE($8,  organic.brand_rules.never_include),
       approved_ctas     = COALESCE($9,  organic.brand_rules.approved_ctas),
       logos             = COALESCE($10::jsonb, organic.brand_rules.logos),
       fonts             = COALESCE($11::jsonb, organic.brand_rules.fonts),
       guidelines_url    = COALESCE($12, organic.brand_rules.guidelines_url),
       content_drive_url = COALESCE($13, organic.brand_rules.content_drive_url),
       guidelines_strict = COALESCE($14, organic.brand_rules.guidelines_strict),
       brand_notes       = COALESCE($15, organic.brand_rules.brand_notes)`,
    [
      orgId,
      input.positioning ?? null,
      input.tone_descriptors ?? null,
      input.brand_pillars ?? null,
      colors ?? null,
      input.banned_words ?? null,
      input.banned_topics ?? null,
      input.never_include ?? null,
      input.approved_ctas ?? null,
      input.logos ? JSON.stringify(input.logos) : null,
      input.fonts ? JSON.stringify(input.fonts) : null,
      input.guidelines_url ?? null,
      input.content_drive_url ?? null,
      input.guidelines_strict ?? null,
      input.brand_notes ?? null,
    ]
  );
  const after = await loadBrandAssets(orgId);
  return { ok: true, missing: after.missing };
}

/* ------------------------------------------------------------------ */
/* Bestanden                                                           */
/* ------------------------------------------------------------------ */

const ALLOWED_LOGO = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const ALLOWED_DOC = ["application/pdf"];
const ALLOWED_FONT = ["font/ttf", "font/otf", "font/woff", "font/woff2",
  "application/x-font-ttf", "application/x-font-otf", "application/octet-stream"];
/** Een merkboek is zo tien megabyte; een logo nooit. Ruim genoeg voor beide,
 *  krap genoeg dat een verkeerd bestand opvalt aan de deur. */
const MAX_BRAND_BYTES = 25 * 1024 * 1024;

export type BrandAssetKind = "logo" | "guidelines" | "font";

/**
 * Een plek tekenen voor een merkbestand.
 *
 * Zelfde reden als bij de video: Vercel kapt een request body af op 4,5 MB en
 * een merkboek-PDF is daar zo overheen. De browser zet het bestand rechtstreeks
 * in de bucket met een token die één pad en twee uur geldig is; de
 * organic-app heeft geen login, dus schrijfrecht voor anon op de bucket zou de
 * bucket openzetten voor iedereen die de hostname kent.
 */
export async function signBrandAssetUpload(
  orgId: string, kind: BrandAssetKind, file: { name: string; type: string; size: number }
): Promise<{ path: string; signed_url: string; public_url: string; filename: string }> {
  const allowed =
    kind === "logo" ? ALLOWED_LOGO : kind === "guidelines" ? ALLOWED_DOC : ALLOWED_FONT;
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? "").toLowerCase();
  const extOk =
    kind === "logo" ? ["png", "jpg", "jpeg", "svg", "webp"].includes(ext)
    : kind === "guidelines" ? ext === "pdf"
    : ["ttf", "otf", "woff", "woff2"].includes(ext);

  if (!allowed.includes(file.type) && !extOk) {
    throw new Error(
      kind === "logo" ? `${file.type || ext || "that file"} is not an image — use PNG, JPG, SVG or WebP`
      : kind === "guidelines" ? "The brand book has to be a PDF, or paste a link to it instead"
      : `${file.type || ext || "that file"} is not a font file — use TTF, OTF, WOFF or WOFF2`
    );
  }
  if (file.size > MAX_BRAND_BYTES) {
    throw new Error(
      `${(file.size / 1048576).toFixed(0)} MB is over the ${MAX_BRAND_BYTES / 1048576} MB limit. ` +
      `For a brand book that big, paste a link instead.`
    );
  }

  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  const path = `organic/${orgId}/brand/${kind}-${Date.now()}-${safe}`;

  const { createAdminClient } = await import("../supabase/admin");
  const bucket = createAdminClient().storage.from("pin-images");
  const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message ?? "no URL"}`);

  return {
    path,
    signed_url: data.signedUrl,
    public_url: bucket.getPublicUrl(path).data.publicUrl,
    filename: safe,
  };
}

/** Het merkboek vastleggen nadat de browser het heeft geüpload. */
export async function registerGuidelines(
  orgId: string, storagePath: string
): Promise<{ ok: true; url: string }> {
  if (!storagePath.startsWith(`organic/${orgId}/brand/`)) {
    throw new Error("That file was not uploaded for this store");
  }
  const { createAdminClient } = await import("../supabase/admin");
  const bucket = createAdminClient().storage.from("pin-images");
  const url = bucket.getPublicUrl(storagePath).data.publicUrl;
  await organicPool().query(
    `INSERT INTO organic.brand_rules (org_id, guidelines_path, guidelines_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id) DO UPDATE
        SET guidelines_path = EXCLUDED.guidelines_path,
            guidelines_url  = EXCLUDED.guidelines_url`,
    [orgId, storagePath, url]
  );
  return { ok: true, url };
}
