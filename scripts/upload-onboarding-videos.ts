/**
 * De onboarding-video's comprimeren en publiceren.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/upload-onboarding-videos.ts <map>
 *
 * De site heeft acht videoplekken (`src/app/onboarding/config.ts`). Dit script
 * pakt een map met de afgemonteerde bestanden, zet elk bestand om naar iets wat
 * een klant daadwerkelijk kan afspelen, zet het in de publieke `uploads`-bucket
 * en drukt het configblok af dat je erin plakt.
 *
 * Waarom de compressie er niet tussenuit kan. De master van de welkomstvideo is
 * 3840x2160 op 30 Mbps: 318 MB voor 88 seconden. Niemand kijkt een
 * onboarding-intro in 4K, maar iedereen dowloadt hem wel — en een klant die de
 * pagina op zijn telefoon opent, wacht. Naar 1080p op CRF 23 wordt datzelfde
 * bestand 21 MB, en op een ingesloten speler van 780 pixels breed zie je het
 * verschil niet. Gemeten 23-09-2026: 93% eraf, 72 seconden werk.
 *
 * Twee vlaggen in de ffmpeg-regel doen het echte werk:
 *
 *   -movflags +faststart   zet de moov-atom vooraan. Zonder dit moet de browser
 *                          het hele bestand binnenhalen voordat er iets speelt,
 *                          en dan is 21 MB alsnog een wachtscherm.
 *   -pix_fmt yuv420p       anders weigert Safari het bestand zonder een woord.
 *
 * ffmpeg wordt niet als dependency toegevoegd: dat is een binary van tientallen
 * megabytes die dan bij elke Vercel-build mee zou installeren voor een script
 * dat een paar keer per jaar draait. Zet hem op je PATH, of wijs ernaar met
 * FFMPEG_BIN=/pad/naar/ffmpeg.
 *
 * DRY_RUN=1 comprimeert en rapporteert, maar uploadt niets.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, basename } from "node:path";

/** De acht plekken in config.ts, met de woorden waarop een bestand erbij hoort.
 *  Het eerste trefwoord dat in de bestandsnaam voorkomt wint, dus de specifieke
 *  staan voor de algemene — "pinterest access" voor "pinterest". */
const SLOTS: Array<{ key: string; hints: string[] }> = [
  { key: "welcome", hints: ["welcome", "welkom", "intro"] },
  { key: "pinterestBusiness", hints: ["business"] },
  { key: "pinterestAccess", hints: ["access", "toegang"] },
  { key: "pinterestTracking", hints: ["tracking", "tag"] },
  { key: "pinterestSetup", hints: ["setup", "pinterest"] },
  // Eén video dekt contracten en facturatie, dus er is geen aparte
  // billing-plek. "billing" hoort daarom hier bij de trefwoorden.
  { key: "contracts", hints: ["contract", "nda", "agreement", "billing", "invoice", "factu"] },
  { key: "kickoff", hints: ["kick-off", "kickoff", "kick off", "call"] },
  { key: "thanks", hints: ["thanks", "thank", "bedankt", "outro"] },
];

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);
const BUCKET = "uploads";
const PREFIX = "onboarding";

const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`;

function ffmpegBin(): string {
  const explicit = process.env.FFMPEG_BIN;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`FFMPEG_BIN points at nothing: ${explicit}`);
    return explicit;
  }
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    throw new Error(
      "No ffmpeg found. Install it (apt install ffmpeg / brew install ffmpeg), " +
      "or point at a binary with FFMPEG_BIN=/path/to/ffmpeg."
    );
  }
}

/** Welke plek hoort bij dit bestand. Een bestand dat nergens op valt wordt
 *  gemeld en overgeslagen: raden welke video de facturatie-uitleg is, is
 *  precies de fout die je pas ziet als een klant hem kijkt. */
function slotFor(file: string): string | null {
  const name = basename(file).toLowerCase();
  const exact = SLOTS.find((s) => basename(file, extname(file)).toLowerCase() === s.key.toLowerCase());
  if (exact) return exact.key;
  for (const s of SLOTS) if (s.hints.some((h) => name.includes(h))) return s.key;
  return null;
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error("Give the folder with the videos as the first argument.");
  if (!existsSync(dir)) throw new Error(`No such folder: ${dir}`);
  const dry = process.env.DRY_RUN === "1";
  const ffmpeg = ffmpegBin();

  const files = readdirSync(dir)
    .filter((f) => VIDEO_EXT.has(extname(f).toLowerCase()))
    .map((f) => join(dir, f))
    .sort();
  if (files.length === 0) throw new Error(`No video files in ${dir}`);

  const taken = new Map<string, string>();
  const skipped: string[] = [];
  for (const f of files) {
    const slot = slotFor(f);
    if (!slot) { skipped.push(basename(f)); continue; }
    if (taken.has(slot)) {
      skipped.push(`${basename(f)} (slot "${slot}" already taken by ${basename(taken.get(slot)!)})`);
      continue;
    }
    taken.set(slot, f);
  }

  console.log(`${files.length} file(s), ${taken.size} matched to a slot${dry ? "  [DRY RUN]" : ""}\n`);
  for (const s of skipped) console.log(`  not matched, skipped: ${s}`);
  if (skipped.length > 0) console.log("    → rename it to the slot name (welcome.mp4, contracts.mp4, kickoff.mp4, …)\n");

  const work = mkdtempSync(join(tmpdir(), "onboarding-video-"));
  const admin = dry ? null : createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const urls = new Map<string, string>();

  for (const [slot, src] of taken) {
    const before = statSync(src).size;
    const out = join(work, `${slot}.mp4`);
    process.stdout.write(`  ${slot.padEnd(18)} ${mb(before).padStart(9)} → `);
    execFileSync(ffmpeg, [
      "-y", "-v", "error", "-i", src,
      // Nooit opschalen: een bron die al 720p is wordt daar niet beter van,
      // alleen groter. -2 houdt de breedte even, wat h264 eist.
      "-vf", "scale=-2:'min(1080,ih)'",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      out,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const after = statSync(out).size;
    process.stdout.write(`${mb(after).padStart(9)}  (${Math.round((1 - after / before) * 100)}% off)`);

    if (admin) {
      const path = `${PREFIX}/${slot}.mp4`;
      const { error } = await admin.storage.from(BUCKET)
        .upload(path, readFileSync(out), { contentType: "video/mp4", upsert: true });
      if (error) { console.log(`  UPLOAD FAILED: ${error.message}`); continue; }
      urls.set(slot, admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      process.stdout.write("  uploaded");
    }
    console.log("");
  }

  if (dry) { console.log("\nDry run — nothing uploaded."); return; }

  console.log("\nPaste this into src/app/onboarding/config.ts:\n");
  console.log("  videos: {");
  for (const s of SLOTS) {
    const u = urls.get(s.key);
    console.log(`    ${(s.key + ":").padEnd(20)}${u ? `"${u}",` : `"",`}${u ? "" : "   // still missing"}`);
  }
  console.log("  },");
}

main().catch((e) => { console.error(`\n${(e as Error).message}`); process.exit(1); });
