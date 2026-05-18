/**
 * Build a Content-Disposition header that works for filenames with non-ASCII
 * characters (em-dash, accented chars, etc.). HTTP headers are ByteStrings
 * (chars 0-255), so dropping a "—" (U+2014 = 8212) into Content-Disposition
 * throws "Cannot convert argument to a ByteString".
 *
 * Strategy: emit both forms per RFC 6266 / 5987.
 *  - filename="..."  — ASCII fallback for older clients (em-dash → "-", etc.)
 *  - filename*=UTF-8''... — percent-encoded UTF-8 for modern browsers, which
 *    use this in preference to the ASCII one
 */
export function contentDisposition(filename: string): string {
  // ASCII fallback: replace anything outside printable ASCII with "-".
  const ascii =
    filename
      .replace(/[^\x20-\x7E]/g, "-")
      // Collapse runs of dashes that result from stripping multi-char
      // sequences.
      .replace(/-{2,}/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "report.docx";
  // RFC 5987 percent-encoding: encodeURIComponent gets us close but it
  // leaves `'` and `*` un-encoded, which break the parser. Encode those too.
  const utf8 = encodeURIComponent(filename)
    .replace(/'/g, "%27")
    .replace(/\*/g, "%2A");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
