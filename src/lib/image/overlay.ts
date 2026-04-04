import sharp from "sharp";

interface OverlayOptions {
  imageUrl: string;
  textLines: string[];
  brandName?: string;
  style?: "bullets" | "review" | "minimal";
  position?: "top" | "bottom";
}

interface OverlayResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Download an image from URL and add professional text overlay.
 * Produces a Pinterest-optimized 2:3 vertical image (1000x1500px).
 */
export async function createPinOverlay(options: OverlayOptions): Promise<OverlayResult> {
  const { imageUrl, textLines, brandName, style = "bullets", position = "top" } = options;

  // Download the source image
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // Resize to Pinterest 2:3 ratio (1000x1500)
  const targetWidth = 1000;
  const targetHeight = 1500;

  const resizedImage = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
    .toBuffer();

  // Build the SVG text overlay
  const svgOverlay = buildOverlaySvg(textLines, brandName, style, position, targetWidth, targetHeight);

  // Composite the text overlay onto the image
  const result = await sharp(resizedImage)
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return { buffer: result, width: targetWidth, height: targetHeight };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildOverlaySvg(
  textLines: string[],
  brandName: string | undefined,
  style: "bullets" | "review" | "minimal",
  position: "top" | "bottom",
  width: number,
  height: number
): string {
  const padding = 40;
  const lineHeight = 52;
  const totalTextHeight = textLines.length * lineHeight + padding * 2 + (brandName ? 40 : 0);

  const gradientY = position === "top" ? 0 : height - totalTextHeight - 60;
  const gradientHeight = totalTextHeight + 60;
  const textStartY = position === "top" ? padding + 44 : height - totalTextHeight - 20 + 44;

  if (style === "review") {
    // Review card style — white rounded rectangle with review text
    const cardWidth = width - 120;
    const cardHeight = totalTextHeight + 40;
    const cardX = 60;
    const cardY = position === "top" ? 60 : height - cardHeight - 80;

    const reviewLines = textLines.map((line, i) => {
      return `<text x="${width / 2}" y="${cardY + 70 + i * lineHeight}"
        font-family="Georgia, serif" font-size="28" fill="#333"
        text-anchor="middle" font-style="italic">${escapeXml(line)}</text>`;
    }).join("\n");

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.15"/>
        </filter>
      </defs>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}"
        rx="16" ry="16" fill="white" fill-opacity="0.95" filter="url(#shadow)"/>
      <text x="${width / 2}" y="${cardY + 36}" font-family="Arial, sans-serif" font-size="24"
        fill="#F59E0B" text-anchor="middle" font-weight="bold">★★★★★</text>
      ${reviewLines}
      ${brandName ? `<text x="${width / 2}" y="${cardY + cardHeight - 20}"
        font-family="Arial, sans-serif" font-size="18" fill="#666"
        text-anchor="middle">— ${escapeXml(brandName)}</text>` : ""}
    </svg>`;
  }

  // Bullets style (default) — gradient background with emoji bullet points
  const bulletLines = textLines.map((line, i) => {
    return `<text x="${padding + 10}" y="${textStartY + i * lineHeight}"
      font-family="Arial, Helvetica, sans-serif" font-size="32" fill="white"
      font-weight="bold" filter="url(#textShadow)">${escapeXml(line)}</text>`;
  }).join("\n");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0" y1="${position === "top" ? "0" : "1"}" x2="0" y2="${position === "top" ? "1" : "0"}">
        <stop offset="0%" stop-color="black" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="black" stop-opacity="0"/>
      </linearGradient>
      <filter id="textShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.5"/>
      </filter>
    </defs>
    <rect x="0" y="${gradientY}" width="${width}" height="${gradientHeight}" fill="url(#grad)"/>
    ${bulletLines}
    ${brandName ? `<text x="${width - padding}" y="${position === "top" ? textStartY + textLines.length * lineHeight + 10 : textStartY - 20}"
      font-family="Arial, sans-serif" font-size="20" fill="white" fill-opacity="0.8"
      text-anchor="end" font-weight="600" filter="url(#textShadow)">${escapeXml(brandName)}</text>` : ""}
  </svg>`;
}
