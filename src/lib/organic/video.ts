/**
 * The rules a video has to satisfy before it can become an organic pin.
 *
 * This module holds **no database access on purpose**, exactly like
 * automation.ts: the upload control is a client component and imports these
 * constants to check a file before it is uploaded, and pg must never reach a
 * client bundle. The server route imports the same functions, so the browser
 * and the API cannot disagree about what is allowed — which is the failure
 * this shape avoids: a file the browser accepts and the route refuses is a
 * 40 MB upload that ends in a red line.
 *
 * Where the numbers come from:
 *
 *   - **The formats** are Pinterest's own list for a video pin (.mp4, .mov,
 *     .m4v). Anything else is refused at the door rather than at publish
 *     time, three days later, in a cron nobody is watching.
 *
 *   - **120 MB** is not Pinterest's limit — theirs is 2 GB. It is ours, and
 *     it is about memory: publishing holds the whole file in one Buffer while
 *     it is handed to Pinterest's S3, and a single 303 MB file is what killed
 *     the paid post-pins route twice in one morning (27-08-2026) with
 *     "instance was killed because it ran out of available memory". The same
 *     guard now stands in front of every video there, and this is the organic
 *     half of it.
 *
 *   - **4 seconds to 15 minutes** and **1:2 to 1.91:1** are Pinterest's
 *     requirements for a video pin. Duration is refused (Pinterest rejects
 *     the pin outright); the aspect ratio is a warning as well as a refusal
 *     outside those bounds, because 2:3 and 9:16 are what the method asks for
 *     and 4:5 is legal but wrong for a CLICK pin.
 */

/** Only the CLICK design carries video — D4 in a four-design waterfall.
 *
 *  Decided 22-09-2026 (Tristan): D1-D3 stay images with their micro-crops, so
 *  the freshness ladder the method is built on stays intact and one cycle
 *  takes one video with it. The check is on the INTENT, not on the number:
 *  "design 4" is a position in a rotation, "the CLICK pin" is what it is for. */
export function canBeVideo(intent: string): boolean {
  return intent === "CLICK";
}

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
] as const;

/** What a file picker should offer. Extensions as well as MIME types: macOS
 *  hands .m4v through with an empty type often enough to matter. */
export const VIDEO_ACCEPT = ".mp4,.mov,.m4v,video/mp4,video/quicktime,video/x-m4v";

/** Ours, not Pinterest's. See the module comment — this is a memory limit. */
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

export const MIN_VIDEO_SECONDS = 4;
export const MAX_VIDEO_SECONDS = 15 * 60;

/** Pinterest accepts between 1:2 (tall) and 1.91:1 (wide), width / height. */
export const MIN_ASPECT = 0.5;
export const MAX_ASPECT = 1.91;

export interface VideoFacts {
  /** The browser's MIME type. Empty is allowed — the extension decides then. */
  type?: string | null;
  name?: string | null;
  size: number;
  /** Seconds, from the video element's metadata. Null when it could not be read. */
  duration?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface VideoVerdict {
  /** Anything here means the file cannot become a pin. */
  errors: string[];
  /** Worth saying, never a refusal. */
  warnings: string[];
}

function extensionOf(name: string | null | undefined): string {
  const m = /\.([a-z0-9]+)$/i.exec((name ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Is this file publishable as a Pinterest video pin?
 *
 * A missing duration or size is a warning, never an error: the browser
 * sometimes cannot read the metadata of a perfectly good file, and refusing
 * on "we could not measure it" costs the operator a file that would have
 * worked. What Pinterest itself refuses — the format, the duration when we
 * DID measure it — is an error.
 */
export function checkVideoFile(f: VideoFacts): VideoVerdict {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ext = extensionOf(f.name);
  const typeOk = (VIDEO_MIME_TYPES as readonly string[]).includes(f.type ?? "");
  const extOk = ["mp4", "mov", "m4v"].includes(ext);
  if (!typeOk && !extOk) {
    errors.push(
      `${f.type || ext || "that file"} is not a video Pinterest accepts — use mp4, mov or m4v.`
    );
  }

  if (f.size > MAX_VIDEO_BYTES) {
    errors.push(
      `${(f.size / 1048576).toFixed(0)} MB is over the ${MAX_VIDEO_BYTES / 1048576} MB we publish. ` +
      `Pinterest allows more, but publishing holds the whole file in memory — export it smaller.`
    );
  }

  if (f.duration != null && Number.isFinite(f.duration) && f.duration > 0) {
    if (f.duration < MIN_VIDEO_SECONDS) {
      errors.push(
        `${f.duration.toFixed(1)}s is too short — Pinterest refuses a video under ${MIN_VIDEO_SECONDS} seconds.`
      );
    } else if (f.duration > MAX_VIDEO_SECONDS) {
      errors.push(`${Math.round(f.duration / 60)} minutes is over the 15-minute maximum.`);
    }
  } else {
    warnings.push(
      "The duration could not be read. Pinterest refuses anything under 4 seconds, " +
      "and you would only find that out when the pin goes out."
    );
  }

  if (f.width && f.height) {
    const ratio = f.width / f.height;
    if (ratio < MIN_ASPECT || ratio > MAX_ASPECT) {
      errors.push(
        `${f.width}×${f.height} is outside the aspect ratio Pinterest accepts (1:2 to 1.91:1).`
      );
    } else if (ratio > 1) {
      warnings.push(
        `${f.width}×${f.height} is landscape. A CLICK pin should be portrait (9:16 or 2:3); ` +
        `landscape renders small in the feed.`
      );
    }
  }

  return { errors, warnings };
}

/** The extension we store the object under, from what the browser gave us. */
export function videoExtension(f: { type?: string | null; name?: string | null }): "mp4" | "mov" | "m4v" {
  const ext = extensionOf(f.name);
  if (ext === "mov" || ext === "m4v" || ext === "mp4") return ext;
  if ((f.type ?? "") === "video/quicktime") return "mov";
  if ((f.type ?? "") === "video/x-m4v") return "m4v";
  return "mp4";
}

/**
 * The SOP file name, with a video extension.
 *
 * Same rule as fileNameFor() and for the same reason — Pinterest reads the
 * file name out of the URL — so a video keeps carrying its primary keyword
 * rather than arriving as "IMG_4821.mp4".
 */
export function videoFileNameFor(primaryKeyword: string, designNumber: number, ext: string): string {
  const slug = primaryKeyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "pin"}-d${designNumber}.${ext}`;
}
