/**
 * Pin creative templates using Satori JSX → SVG → JPEG rendering.
 * Produces Pinterest-optimized 2:3 vertical images (1000x1500px)
 * with professional text overlays on real product photos.
 *
 * SATORI RULES (critical):
 * - Every <div> with 2+ children MUST have display: "flex"
 * - No transform property support
 * - Use display: "flex" everywhere to be safe
 * - Strings as children are OK for single-child divs
 */

import satori from "satori";
import sharp from "sharp";

// ─── Types ───
export type PinTemplate =
  | "hero"
  | "editorial"
  | "tips"
  | "stat"
  | "review"
  | "lifestyle"
  | "benefits"
  | "bullets";

interface PinCreativeInput {
  template: PinTemplate;
  productImageUrl: string;
  brandName: string;
  textLines: string[];
  reviewAuthor?: string;
  reviewTitle?: string;
  accentColor?: string;
  statNumber?: string;
}

interface PinCreativeResult {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: string;
}

const WIDTH = 1000;
const HEIGHT = 1500;

// ─── Color utilities ───
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ─── Font loading ───
async function loadFont(): Promise<ArrayBuffer> {
  const res = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
  );
  return res.arrayBuffer();
}

async function loadFontBold(): Promise<ArrayBuffer> {
  const res = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf"
  );
  return res.arrayBuffer();
}

// ─── Helper: wrap text in a div (Satori needs element children, not raw strings mixed with elements) ───
function textDiv(text: string, style: Record<string, unknown> = {}) {
  return {
    type: "div" as const,
    props: {
      style: { display: "flex" as const, ...style },
      children: text,
    },
  };
}

function emptyDiv(style: Record<string, unknown>) {
  return {
    type: "div" as const,
    props: {
      style: { display: "flex" as const, ...style },
      children: "",
    },
  };
}

// ─── Template: Hero Product ───
function HeroTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const headline = input.textLines[0] || input.brandName;
  const subtitle = input.textLines.slice(1).join(" ") || "";

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        {
          type: "img" as const,
          props: {
            src: input.productImageUrl,
            width: WIDTH,
            height: HEIGHT,
            style: {
              objectFit: "cover" as const,
              position: "absolute" as const,
              top: 0, left: 0,
              width: "100%", height: "100%",
            },
          },
        },
        textDiv(input.brandName, {
          position: "absolute" as const,
          top: 40, left: 50,
          fontSize: 18, fontWeight: 700,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: 3,
          textTransform: "uppercase" as const,
        }),
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              position: "absolute" as const,
              bottom: 0, left: 0, right: 0,
              background: "linear-gradient(transparent 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.85) 100%)",
              padding: "160px 56px 56px",
              gap: "16px",
            },
            children: [
              textDiv(headline, {
                fontSize: 44, fontWeight: 700, color: "white",
                lineHeight: 1.15, letterSpacing: -0.5,
              }),
              ...(subtitle ? [textDiv(subtitle, {
                fontSize: 24, color: "rgba(255,255,255,0.85)", lineHeight: 1.5,
              })] : []),
              textDiv("Shop Now", {
                marginTop: 12,
                backgroundColor: accent,
                color: isLightColor(accent) ? "#1a1a1a" : "white",
                padding: "14px 36px",
                borderRadius: 50, fontSize: 22, fontWeight: 700,
                letterSpacing: 0.5,
              }),
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Editorial ───
function EditorialTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#2D5016";
  const { r, g, b } = hexToRgb(accent);
  const bgTint = `rgba(${r}, ${g}, ${b}, 0.06)`;
  const headline = input.textLines[0] || "";
  const bodyLines = input.textLines.slice(1);

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        flexDirection: "column" as const,
        width: WIDTH, height: HEIGHT,
        fontFamily: "Inter",
        backgroundColor: "#FAFAF8",
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              padding: "56px 56px 40px",
              backgroundColor: bgTint,
              gap: "20px",
            },
            children: [
              textDiv(input.brandName, {
                fontSize: 16, fontWeight: 700, color: accent,
                letterSpacing: 3, textTransform: "uppercase" as const,
              }),
              textDiv(headline, {
                fontSize: 40, fontWeight: 700, color: "#1a1a1a",
                lineHeight: 1.2, letterSpacing: -0.5,
              }),
              ...bodyLines.map((line) => ({
                type: "div" as const,
                props: {
                  style: {
                    display: "flex" as const,
                    alignItems: "flex-start" as const,
                    gap: "14px",
                  },
                  children: [
                    emptyDiv({
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: accent, flexShrink: 0, marginTop: 10,
                    }),
                    textDiv(line, {
                      fontSize: 24, color: "#444", lineHeight: 1.5,
                    }),
                  ],
                },
              })),
            ],
          },
        },
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const, flex: 1,
              overflow: "hidden" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH, height: 900,
                  style: { objectFit: "cover" as const, width: "100%", height: "100%" },
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Tips / How-To ───
function TipsTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const title = input.textLines[0] || "Top Tips";
  const tips = input.textLines.slice(1);

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        flexDirection: "column" as const,
        width: WIDTH, height: HEIGHT,
        fontFamily: "Inter",
        backgroundColor: "#FFFFFF",
      },
      children: [
        // Product image with gradient fade and brand label
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              height: "38%",
              position: "relative" as const,
              overflow: "hidden" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH, height: 570,
                  style: { objectFit: "cover" as const, width: "100%", height: "100%" },
                },
              },
              emptyDiv({
                position: "absolute" as const,
                bottom: 0, left: 0, right: 0, height: 80,
                background: "linear-gradient(transparent, #FFFFFF)",
              }),
              textDiv(input.brandName, {
                position: "absolute" as const,
                top: 30, left: 40,
                fontSize: 16, fontWeight: 700, color: "white",
                letterSpacing: 2, textTransform: "uppercase" as const,
                backgroundColor: "rgba(0,0,0,0.4)",
                padding: "6px 14px", borderRadius: 6,
              }),
            ],
          },
        },
        // Title
        textDiv(title, {
          padding: "16px 56px 24px",
          fontSize: 36, fontWeight: 700, color: "#1a1a1a",
          lineHeight: 1.2, letterSpacing: -0.3,
        }),
        // Tips list
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              padding: "0 56px 56px",
              gap: "20px", flex: 1,
            },
            children: tips.map((tip, i) => ({
              type: "div" as const,
              props: {
                style: {
                  display: "flex" as const,
                  alignItems: "flex-start" as const,
                  gap: "18px",
                },
                children: [
                  textDiv(String(i + 1), {
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: accent,
                    color: isLightColor(accent) ? "#1a1a1a" : "white",
                    alignItems: "center" as const,
                    justifyContent: "center" as const,
                    fontSize: 22, fontWeight: 700, flexShrink: 0,
                  }),
                  textDiv(tip, {
                    fontSize: 24, color: "#333",
                    lineHeight: 1.5, paddingTop: 8,
                  }),
                ],
              },
            })),
          },
        },
        // Bottom accent bar
        emptyDiv({ height: 6, backgroundColor: accent }),
      ],
    },
  };
}

// ─── Template: Stat / Data ───
function StatTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const statValue = input.statNumber || input.textLines[0] || "$29.99";
  const headline = input.statNumber ? input.textLines[0] : input.textLines[1] || "";
  const body = input.textLines.slice(input.statNumber ? 1 : 2).join(" ");

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        width: WIDTH, height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        {
          type: "img" as const,
          props: {
            src: input.productImageUrl,
            width: WIDTH, height: HEIGHT,
            style: {
              objectFit: "cover" as const,
              position: "absolute" as const,
              top: 0, left: 0, width: "100%", height: "100%",
            },
          },
        },
        emptyDiv({
          position: "absolute" as const,
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.55)",
        }),
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              position: "absolute" as const,
              top: 0, left: 0, right: 0, bottom: 0,
              padding: "80px 60px",
              gap: "24px",
            },
            children: [
              textDiv(input.brandName, {
                fontSize: 16, fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                letterSpacing: 3, textTransform: "uppercase" as const,
              }),
              textDiv(statValue, {
                fontSize: 96, fontWeight: 700, color: accent,
                lineHeight: 1, textAlign: "center" as const,
              }),
              ...(headline ? [textDiv(headline, {
                fontSize: 36, fontWeight: 700, color: "white",
                textAlign: "center" as const, lineHeight: 1.3,
              })] : []),
              emptyDiv({
                width: 60, height: 3,
                backgroundColor: accent, borderRadius: 2,
              }),
              ...(body ? [textDiv(body, {
                fontSize: 22, color: "rgba(255,255,255,0.85)",
                textAlign: "center" as const, lineHeight: 1.6, maxWidth: 700,
              })] : []),
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Review / Testimonial ───
function ReviewTemplate(input: PinCreativeInput) {
  const reviewText = input.textLines.join(" ");
  const title = input.reviewTitle || "Customer Favorite";

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        flexDirection: "column" as const,
        width: WIDTH, height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        {
          type: "img" as const,
          props: {
            src: input.productImageUrl,
            width: WIDTH, height: HEIGHT,
            style: {
              objectFit: "cover" as const,
              position: "absolute" as const,
              top: 0, left: 0, width: "100%", height: "100%",
            },
          },
        },
        emptyDiv({
          position: "absolute" as const,
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.25)",
        }),
        // Brand watermark top-left
        textDiv(input.brandName, {
          position: "absolute" as const,
          top: 32, left: 40,
          fontSize: 16, fontWeight: 700,
          color: "rgba(255,255,255,0.8)",
          letterSpacing: 2, textTransform: "uppercase" as const,
        }),
        // Review card - centered with manual top offset instead of transform
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              alignItems: "center" as const,
              position: "absolute" as const,
              top: 350, left: 50, right: 50,
              backgroundColor: "rgba(255,255,255,0.96)",
              borderRadius: 24,
              padding: "48px 44px",
              boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
            },
            children: [
              textDiv("★ ★ ★ ★ ★", {
                fontSize: 32, color: "#F59E0B",
                letterSpacing: 4, marginBottom: 16,
              }),
              textDiv(`"${title}"`, {
                fontSize: 30, fontWeight: 700, color: "#1a1a1a",
                marginBottom: 20, textAlign: "center" as const, lineHeight: 1.3,
              }),
              textDiv(reviewText, {
                fontSize: 22, color: "#555",
                textAlign: "center" as const, lineHeight: 1.6,
                fontStyle: "italic" as const,
              }),
              emptyDiv({
                width: 40, height: 2,
                backgroundColor: "#ddd",
                marginTop: 24, marginBottom: 16,
              }),
              textDiv(input.reviewAuthor || "Verified Buyer", {
                fontSize: 18, fontWeight: 600, color: "#888",
                textTransform: "uppercase" as const, letterSpacing: 1,
              }),
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Lifestyle ───
function LifestyleTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const headline = input.textLines[0] || "";

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        width: WIDTH, height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        {
          type: "img" as const,
          props: {
            src: input.productImageUrl,
            width: WIDTH, height: HEIGHT,
            style: {
              objectFit: "cover" as const,
              position: "absolute" as const,
              top: 0, left: 0, width: "100%", height: "100%",
            },
          },
        },
        emptyDiv({
          position: "absolute" as const,
          bottom: 0, left: 0, right: 0, height: 300,
          background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
        }),
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              position: "absolute" as const,
              bottom: 48, left: 48, right: 48,
              gap: "12px",
            },
            children: [
              ...(headline ? [textDiv(headline, {
                fontSize: 36, fontWeight: 700, color: "white", lineHeight: 1.25,
              })] : []),
              {
                type: "div" as const,
                props: {
                  style: {
                    display: "flex" as const,
                    alignItems: "center" as const,
                    gap: "12px",
                  },
                  children: [
                    emptyDiv({
                      width: 28, height: 3,
                      backgroundColor: accent, borderRadius: 2,
                    }),
                    textDiv(input.brandName, {
                      fontSize: 16, fontWeight: 700,
                      color: "rgba(255,255,255,0.75)",
                      letterSpacing: 2, textTransform: "uppercase" as const,
                    }),
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Benefits ───
function BenefitsTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex" as const,
        flexDirection: "column" as const,
        width: WIDTH, height: HEIGHT,
        fontFamily: "Inter",
        backgroundColor: "#FFF9F0",
      },
      children: [
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              height: "52%",
              overflow: "hidden" as const,
              position: "relative" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH, height: 780,
                  style: { objectFit: "cover" as const, width: "100%", height: "100%" },
                },
              },
              textDiv(input.brandName, {
                position: "absolute" as const,
                top: 30, right: 30,
                fontSize: 14, fontWeight: 700, color: "white",
                backgroundColor: "rgba(0,0,0,0.45)",
                padding: "6px 14px", borderRadius: 6,
                letterSpacing: 1, textTransform: "uppercase" as const,
              }),
            ],
          },
        },
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex" as const,
              flexDirection: "column" as const,
              flex: 1,
              padding: "40px 56px",
              gap: "18px",
              justifyContent: "center" as const,
            },
            children: input.textLines.map((line) => ({
              type: "div" as const,
              props: {
                style: {
                  display: "flex" as const,
                  alignItems: "flex-start" as const,
                  gap: "16px",
                },
                children: [
                  textDiv("✓", {
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: accent,
                    color: isLightColor(accent) ? "#1a1a1a" : "white",
                    alignItems: "center" as const,
                    justifyContent: "center" as const,
                    fontSize: 18, fontWeight: 700, flexShrink: 0,
                  }),
                  textDiv(line, {
                    fontSize: 26, fontWeight: 600, color: "#2a2a2a",
                    lineHeight: 1.4, paddingTop: 2,
                  }),
                ],
              },
            })),
          },
        },
      ],
    },
  };
}

// ─── Template registry ───
const templates: Record<PinTemplate, (input: PinCreativeInput) => unknown> = {
  hero: HeroTemplate,
  editorial: EditorialTemplate,
  tips: TipsTemplate,
  stat: StatTemplate,
  review: ReviewTemplate,
  lifestyle: LifestyleTemplate,
  benefits: BenefitsTemplate,
  bullets: EditorialTemplate,
};

export function suggestTemplate(
  visualStyle: string,
  textOverlay: string,
  textLines: string[]
): PinTemplate {
  if (/^[\d$\u20AC\u00A3%]/.test(textOverlay.trim())) return "stat";
  if (textLines.length >= 3 && textLines.some((l) => /^\d/.test(l.trim()))) return "tips";
  const styleMap: Record<string, PinTemplate> = {
    lifestyle: "lifestyle",
    flat_lay: "editorial",
    closeup: "hero",
    model: "lifestyle",
    infographic: "tips",
  };
  return styleMap[visualStyle] || "hero";
}

// ─── Main render function ───
export async function renderPinCreative(input: PinCreativeInput): Promise<PinCreativeResult> {
  const [fontData, fontBoldData] = await Promise.all([loadFont(), loadFontBold()]);

  const resolvedTemplate = input.template in templates ? input.template : "hero";
  const templateFn = templates[resolvedTemplate];
  const element = templateFn(input);

  const svg = await satori(element as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Inter", data: fontData, weight: 400, style: "normal" },
      { name: "Inter", data: fontBoldData, weight: 700, style: "normal" },
    ],
  });

  const jpegBuffer = await sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT)
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    buffer: jpegBuffer,
    width: WIDTH,
    height: HEIGHT,
    contentType: "image/jpeg",
  };
}
