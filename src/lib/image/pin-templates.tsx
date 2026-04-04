/**
 * Pin creative templates using Satori JSX → SVG → PNG rendering.
 * Produces Pinterest-optimized 2:3 vertical images (1000x1500px)
 * with professional text overlays on real product photos.
 */

import satori from "satori";
import sharp from "sharp";

// ─── Types ───
export type PinTemplate = "bullets" | "review" | "hero" | "benefits";

interface PinCreativeInput {
  template: PinTemplate;
  productImageUrl: string;
  brandName: string;
  textLines: string[];
  reviewAuthor?: string;
  reviewTitle?: string;
  accentColor?: string;
}

interface PinCreativeResult {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: string;
}

const WIDTH = 1000;
const HEIGHT = 1500;

// ─── Font loading ───
async function loadFont(): Promise<ArrayBuffer> {
  // Use Inter from Google Fonts (clean, modern, works great for Pinterest)
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

// ─── Emoji map (text representations for SVG) ───
const EMOJIS: Record<string, string> = {
  "👜": "👜", "🎨": "🎨", "📖": "📖", "🌟": "🌟",
  "✅": "✅", "✔️": "✔", "⭐": "★", "💚": "♥",
  "🎁": "🎁", "🖌️": "🖌", "💡": "💡", "🏆": "🏆",
};

// ─── Template: Bullet Points ───
// Like the TobiosKits example with emoji bullets on a gradient overlay
function BulletsTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#2D5016";

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        // Top section with text on white/light background
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              padding: "50px 50px 40px",
              backgroundColor: "#FAFAF8",
              gap: "12px",
            },
            children: input.textLines.map((line) => ({
              type: "div" as const,
              props: {
                style: {
                  display: "flex",
                  alignItems: "center" as const,
                  fontSize: 32,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  lineHeight: 1.4,
                },
                children: line,
              },
            })),
          },
        },
        // Bottom section - product image fills remaining space
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flex: 1,
              position: "relative" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH,
                  height: HEIGHT - 350,
                  style: {
                    objectFit: "cover" as const,
                    width: "100%",
                    height: "100%",
                  },
                },
              },
            ],
          },
        },
        // Brand watermark bottom-right
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              bottom: 20,
              right: 30,
              fontSize: 22,
              fontWeight: 700,
              color: "white",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: "8px 16px",
              borderRadius: 8,
            },
            children: input.brandName,
          },
        },
      ],
    },
  };
}

// ─── Template: Review Card ───
// White card with stars and testimonial overlaid on lifestyle photo
function ReviewTemplate(input: PinCreativeInput) {
  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        // Full background image
        {
          type: "img" as const,
          props: {
            src: input.productImageUrl,
            width: WIDTH,
            height: HEIGHT,
            style: {
              objectFit: "cover" as const,
              position: "absolute" as const,
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
            },
          },
        },
        // Review card overlay
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: 80,
              left: 60,
              right: 60,
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 20,
              padding: "40px 36px",
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center" as const,
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            },
            children: [
              // Stars
              {
                type: "div" as const,
                props: {
                  style: { fontSize: 36, color: "#F59E0B", marginBottom: 8 },
                  children: "★★★★★",
                },
              },
              // Review title
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    marginBottom: 16,
                    textAlign: "center" as const,
                  },
                  children: input.reviewTitle || "Amazing product!",
                },
              },
              // Review text
              ...input.textLines.map((line) => ({
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 24,
                    color: "#444",
                    textAlign: "center" as const,
                    lineHeight: 1.5,
                    fontStyle: "italic" as const,
                  },
                  children: line,
                },
              })),
              // Author
              {
                type: "div" as const,
                props: {
                  style: {
                    marginTop: 20,
                    fontSize: 20,
                    fontWeight: 600,
                    color: "#666",
                    borderTop: "1px solid #eee",
                    paddingTop: 16,
                    width: "100%",
                    textAlign: "center" as const,
                  },
                  children: `— ${input.reviewAuthor || "Happy Customer"}`,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Hero Product ───
// Clean product showcase with CTA at bottom
function HeroTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        position: "relative" as const,
      },
      children: [
        // Product image
        {
          type: "img" as const,
          props: {
            src: input.productImageUrl,
            width: WIDTH,
            height: HEIGHT,
            style: {
              objectFit: "cover" as const,
              width: "100%",
              height: "100%",
              position: "absolute" as const,
              top: 0,
              left: 0,
            },
          },
        },
        // Bottom gradient with CTA
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              bottom: 0,
              left: 0,
              right: 0,
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              padding: "120px 50px 50px",
              display: "flex",
              flexDirection: "column" as const,
              gap: "12px",
            },
            children: [
              // Title
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 38,
                    fontWeight: 700,
                    color: "white",
                    lineHeight: 1.2,
                  },
                  children: input.textLines[0] || input.brandName,
                },
              },
              // Subtitle lines
              ...input.textLines.slice(1).map((line) => ({
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 26,
                    color: "rgba(255,255,255,0.9)",
                    lineHeight: 1.4,
                  },
                  children: line,
                },
              })),
              // CTA button
              {
                type: "div" as const,
                props: {
                  style: {
                    marginTop: 16,
                    backgroundColor: accent,
                    color: "white",
                    padding: "14px 32px",
                    borderRadius: 30,
                    fontSize: 24,
                    fontWeight: 700,
                    textAlign: "center" as const,
                    alignSelf: "flex-start" as const,
                  },
                  children: "Shop Now →",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Benefits Grid ───
// Product image with benefit badges
function BenefitsTemplate(input: PinCreativeInput) {
  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        backgroundColor: "#FFF9F0",
      },
      children: [
        // Product image top half
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              height: "55%",
              overflow: "hidden" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH,
                  height: 825,
                  style: { objectFit: "cover" as const, width: "100%", height: "100%" },
                },
              },
            ],
          },
        },
        // Benefits section bottom half
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              flex: 1,
              padding: "40px 50px",
              gap: "16px",
              justifyContent: "center" as const,
            },
            children: [
              // Brand name
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#999",
                    letterSpacing: 2,
                    textTransform: "uppercase" as const,
                    marginBottom: 8,
                  },
                  children: input.brandName,
                },
              },
              // Benefit lines
              ...input.textLines.map((line) => ({
                type: "div" as const,
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center" as const,
                    gap: "12px",
                    fontSize: 28,
                    fontWeight: 600,
                    color: "#2a2a2a",
                    lineHeight: 1.5,
                  },
                  children: [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#D4762C",
                          flexShrink: 0,
                        },
                        children: [],
                      },
                    },
                    line,
                  ],
                },
              })),
            ],
          },
        },
      ],
    },
  };
}

// ─── Main render function ───
export async function renderPinCreative(input: PinCreativeInput): Promise<PinCreativeResult> {
  const [fontData, fontBoldData] = await Promise.all([loadFont(), loadFontBold()]);

  const templates: Record<PinTemplate, (input: PinCreativeInput) => unknown> = {
    bullets: BulletsTemplate,
    review: ReviewTemplate,
    hero: HeroTemplate,
    benefits: BenefitsTemplate,
  };

  const templateFn = templates[input.template] || templates.bullets;
  const element = templateFn(input);

  // Render JSX to SVG via Satori
  const svg = await satori(element as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Inter", data: fontData, weight: 400, style: "normal" },
      { name: "Inter", data: fontBoldData, weight: 700, style: "normal" },
    ],
  });

  // Convert SVG to JPEG via sharp (compatible with Vercel/Turbopack)
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
