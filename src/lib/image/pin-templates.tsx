/**
 * Pin creative templates using Satori JSX → SVG → JPEG rendering.
 * Produces Pinterest-optimized 2:3 vertical images (1000x1500px)
 * with professional text overlays on real product photos.
 *
 * Template types aligned with Pinterest's creative best practices:
 * - hero: Full-bleed product image with gradient overlay + CTA
 * - editorial: Magazine-style split layout (text + image)
 * - tips: Numbered tips/how-to list with product context
 * - stat: Large stat/number with supporting context
 * - review: Customer testimonial card on product backdrop
 * - lifestyle: Minimal text overlay on lifestyle product shot
 * - benefits: Clean benefit list below product image
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
  // Legacy aliases
  | "bullets";

interface PinCreativeInput {
  template: PinTemplate;
  productImageUrl: string;
  brandName: string;
  textLines: string[];
  reviewAuthor?: string;
  reviewTitle?: string;
  accentColor?: string;
  /** Optional stat number for stat template (e.g. "$29.99", "79%", "5 stars") */
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

// ─── Template: Hero Product ───
// Full-bleed product photo with cinematic gradient overlay and bold CTA.
// Best for: product launches, hero shots, premium positioning.
function HeroTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const headline = input.textLines[0] || input.brandName;
  const subtitle = input.textLines.slice(1).join(" ") || "";

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
        // Top brand label
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: 40,
              left: 50,
              fontSize: 18,
              fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: 3,
              textTransform: "uppercase" as const,
            },
            children: input.brandName,
          },
        },
        // Bottom gradient overlay
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              bottom: 0,
              left: 0,
              right: 0,
              background: "linear-gradient(transparent 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.85) 100%)",
              padding: "160px 56px 56px",
              display: "flex",
              flexDirection: "column" as const,
              gap: "16px",
            },
            children: [
              // Headline
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 44,
                    fontWeight: 700,
                    color: "white",
                    lineHeight: 1.15,
                    letterSpacing: -0.5,
                  },
                  children: headline,
                },
              },
              // Subtitle
              ...(subtitle
                ? [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 24,
                          color: "rgba(255,255,255,0.85)",
                          lineHeight: 1.5,
                        },
                        children: subtitle,
                      },
                    },
                  ]
                : []),
              // CTA pill
              {
                type: "div" as const,
                props: {
                  style: {
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center" as const,
                  },
                  children: [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          backgroundColor: accent,
                          color: isLightColor(accent) ? "#1a1a1a" : "white",
                          padding: "14px 36px",
                          borderRadius: 50,
                          fontSize: 22,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                        },
                        children: "Shop Now",
                      },
                    },
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

// ─── Template: Editorial ───
// Magazine-style: left text column on tinted background, right product image.
// Like a fashion editorial spread — text-first for SEO, image for engagement.
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
        display: "flex",
        flexDirection: "column" as const,
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        backgroundColor: "#FAFAF8",
      },
      children: [
        // Top section: text area
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              padding: "56px 56px 40px",
              backgroundColor: bgTint,
              gap: "20px",
            },
            children: [
              // Brand label
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 16,
                    fontWeight: 700,
                    color: accent,
                    letterSpacing: 3,
                    textTransform: "uppercase" as const,
                  },
                  children: input.brandName,
                },
              },
              // Headline
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 40,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    lineHeight: 1.2,
                    letterSpacing: -0.5,
                  },
                  children: headline,
                },
              },
              // Body lines as bullet points
              ...bodyLines.map((line) => ({
                type: "div" as const,
                props: {
                  style: {
                    display: "flex",
                    alignItems: "flex-start" as const,
                    gap: "14px",
                    fontSize: 24,
                    color: "#444",
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
                          backgroundColor: accent,
                          flexShrink: 0,
                          marginTop: 10,
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
        // Bottom section: product image fills rest
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flex: 1,
              position: "relative" as const,
              overflow: "hidden" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH,
                  height: 900,
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
      ],
    },
  };
}

// ─── Template: Tips / How-To ───
// Numbered list format perfect for "5 Ways to..." or "How to..." pins.
// These get 30%+ more saves on Pinterest.
function TipsTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const title = input.textLines[0] || "Top Tips";
  const tips = input.textLines.slice(1);

  return {
    type: "div" as const,
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        width: WIDTH,
        height: HEIGHT,
        fontFamily: "Inter",
        backgroundColor: "#FFFFFF",
      },
      children: [
        // Product image top portion (40%)
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              height: "38%",
              position: "relative" as const,
              overflow: "hidden" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH,
                  height: 570,
                  style: {
                    objectFit: "cover" as const,
                    width: "100%",
                    height: "100%",
                  },
                },
              },
              // Gradient fade at bottom of image
              {
                type: "div" as const,
                props: {
                  style: {
                    position: "absolute" as const,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 80,
                    background: "linear-gradient(transparent, #FFFFFF)",
                  },
                  children: [],
                },
              },
              // Brand label overlay
              {
                type: "div" as const,
                props: {
                  style: {
                    position: "absolute" as const,
                    top: 30,
                    left: 40,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "white",
                    letterSpacing: 2,
                    textTransform: "uppercase" as const,
                    backgroundColor: "rgba(0,0,0,0.4)",
                    padding: "6px 14px",
                    borderRadius: 6,
                  },
                  children: input.brandName,
                },
              },
            ],
          },
        },
        // Title
        {
          type: "div" as const,
          props: {
            style: {
              padding: "16px 56px 24px",
              fontSize: 36,
              fontWeight: 700,
              color: "#1a1a1a",
              lineHeight: 1.2,
              letterSpacing: -0.3,
            },
            children: title,
          },
        },
        // Numbered tips list
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              padding: "0 56px 56px",
              gap: "20px",
              flex: 1,
            },
            children: tips.map((tip, i) => ({
              type: "div" as const,
              props: {
                style: {
                  display: "flex",
                  alignItems: "flex-start" as const,
                  gap: "18px",
                },
                children: [
                  // Number circle
                  {
                    type: "div" as const,
                    props: {
                      style: {
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: accent,
                        color: isLightColor(accent) ? "#1a1a1a" : "white",
                        display: "flex",
                        alignItems: "center" as const,
                        justifyContent: "center" as const,
                        fontSize: 22,
                        fontWeight: 700,
                        flexShrink: 0,
                      },
                      children: String(i + 1),
                    },
                  },
                  // Tip text
                  {
                    type: "div" as const,
                    props: {
                      style: {
                        fontSize: 24,
                        color: "#333",
                        lineHeight: 1.5,
                        paddingTop: 8,
                      },
                      children: tip,
                    },
                  },
                ],
              },
            })),
          },
        },
        // Bottom accent bar
        {
          type: "div" as const,
          props: {
            style: {
              height: 6,
              backgroundColor: accent,
            },
            children: [],
          },
        },
      ],
    },
  };
}

// ─── Template: Stat / Data ───
// Large number/stat as the hero, supporting context below.
// Great for "Save $X/year", price callouts, percentages.
function StatTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const statValue = input.statNumber || input.textLines[0] || "$29.99";
  const headline = input.statNumber ? input.textLines[0] : input.textLines[1] || "";
  const body = input.textLines.slice(input.statNumber ? 1 : 2).join(" ");

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
        // Background product image
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
        // Dark overlay for text readability
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.55)",
            },
            children: [],
          },
        },
        // Content centered
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              padding: "80px 60px",
              gap: "24px",
            },
            children: [
              // Brand label
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 16,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.7)",
                    letterSpacing: 3,
                    textTransform: "uppercase" as const,
                  },
                  children: input.brandName,
                },
              },
              // Big stat number
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 96,
                    fontWeight: 700,
                    color: accent,
                    lineHeight: 1,
                    textAlign: "center" as const,
                  },
                  children: statValue,
                },
              },
              // Headline
              ...(headline
                ? [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 36,
                          fontWeight: 700,
                          color: "white",
                          textAlign: "center" as const,
                          lineHeight: 1.3,
                        },
                        children: headline,
                      },
                    },
                  ]
                : []),
              // Divider line
              {
                type: "div" as const,
                props: {
                  style: {
                    width: 60,
                    height: 3,
                    backgroundColor: accent,
                    borderRadius: 2,
                  },
                  children: [],
                },
              },
              // Body text
              ...(body
                ? [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 22,
                          color: "rgba(255,255,255,0.85)",
                          textAlign: "center" as const,
                          lineHeight: 1.6,
                          maxWidth: 700,
                        },
                        children: body,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
      ],
    },
  };
}

// ─── Template: Review / Testimonial ───
// Elegant card with stars and testimonial on product backdrop.
function ReviewTemplate(input: PinCreativeInput) {
  const reviewText = input.textLines.join(" ");
  const title = input.reviewTitle || "Customer Favorite";

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
        // Background image
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
        // Soft darkening overlay
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.25)",
            },
            children: [],
          },
        },
        // Review card — centered floating card
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: "50%",
              left: 50,
              right: 50,
              transform: "translateY(-50%)",
              backgroundColor: "rgba(255,255,255,0.96)",
              borderRadius: 24,
              padding: "48px 44px",
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "center" as const,
              boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
            },
            children: [
              // Stars row
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 32,
                    color: "#F59E0B",
                    letterSpacing: 4,
                    marginBottom: 16,
                  },
                  children: "★ ★ ★ ★ ★",
                },
              },
              // Review title
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 30,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    marginBottom: 20,
                    textAlign: "center" as const,
                    lineHeight: 1.3,
                  },
                  children: `"${title}"`,
                },
              },
              // Review text
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 22,
                    color: "#555",
                    textAlign: "center" as const,
                    lineHeight: 1.6,
                    fontStyle: "italic" as const,
                  },
                  children: reviewText,
                },
              },
              // Divider
              {
                type: "div" as const,
                props: {
                  style: {
                    width: 40,
                    height: 2,
                    backgroundColor: "#ddd",
                    marginTop: 24,
                    marginBottom: 16,
                  },
                  children: [],
                },
              },
              // Author
              {
                type: "div" as const,
                props: {
                  style: {
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#888",
                    textTransform: "uppercase" as const,
                    letterSpacing: 1,
                  },
                  children: input.reviewAuthor || "Verified Buyer",
                },
              },
            ],
          },
        },
        // Brand watermark top-left
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              top: 32,
              left: 40,
              fontSize: 16,
              fontWeight: 700,
              color: "rgba(255,255,255,0.8)",
              letterSpacing: 2,
              textTransform: "uppercase" as const,
            },
            children: input.brandName,
          },
        },
      ],
    },
  };
}

// ─── Template: Lifestyle ───
// Minimal overlay on a full-bleed lifestyle shot. The image does the talking.
// Best for: aspirational shots, fashion, beauty, home decor.
function LifestyleTemplate(input: PinCreativeInput) {
  const accent = input.accentColor || "#D4762C";
  const headline = input.textLines[0] || "";

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
        // Full bleed image
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
        // Subtle bottom gradient
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              bottom: 0,
              left: 0,
              right: 0,
              height: 300,
              background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
            },
            children: [],
          },
        },
        // Bottom text
        {
          type: "div" as const,
          props: {
            style: {
              position: "absolute" as const,
              bottom: 48,
              left: 48,
              right: 48,
              display: "flex",
              flexDirection: "column" as const,
              gap: "12px",
            },
            children: [
              ...(headline
                ? [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 36,
                          fontWeight: 700,
                          color: "white",
                          lineHeight: 1.25,
                        },
                        children: headline,
                      },
                    },
                  ]
                : []),
              // Brand + accent line
              {
                type: "div" as const,
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center" as const,
                    gap: "12px",
                  },
                  children: [
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          width: 28,
                          height: 3,
                          backgroundColor: accent,
                          borderRadius: 2,
                        },
                        children: [],
                      },
                    },
                    {
                      type: "div" as const,
                      props: {
                        style: {
                          fontSize: 16,
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.75)",
                          letterSpacing: 2,
                          textTransform: "uppercase" as const,
                        },
                        children: input.brandName,
                      },
                    },
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
// Clean product image above, benefit list below on warm background.
function BenefitsTemplate(input: PinCreativeInput) {
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
        backgroundColor: "#FFF9F0",
      },
      children: [
        // Product image top portion
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
              height: "52%",
              overflow: "hidden" as const,
              position: "relative" as const,
            },
            children: [
              {
                type: "img" as const,
                props: {
                  src: input.productImageUrl,
                  width: WIDTH,
                  height: 780,
                  style: { objectFit: "cover" as const, width: "100%", height: "100%" },
                },
              },
              // Brand tag on image
              {
                type: "div" as const,
                props: {
                  style: {
                    position: "absolute" as const,
                    top: 30,
                    right: 30,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "white",
                    backgroundColor: "rgba(0,0,0,0.45)",
                    padding: "6px 14px",
                    borderRadius: 6,
                    letterSpacing: 1,
                    textTransform: "uppercase" as const,
                  },
                  children: input.brandName,
                },
              },
            ],
          },
        },
        // Benefits section
        {
          type: "div" as const,
          props: {
            style: {
              display: "flex",
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
                  display: "flex",
                  alignItems: "flex-start" as const,
                  gap: "16px",
                },
                children: [
                  // Checkmark circle
                  {
                    type: "div" as const,
                    props: {
                      style: {
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: accent,
                        color: isLightColor(accent) ? "#1a1a1a" : "white",
                        display: "flex",
                        alignItems: "center" as const,
                        justifyContent: "center" as const,
                        fontSize: 18,
                        fontWeight: 700,
                        flexShrink: 0,
                      },
                      children: "✓",
                    },
                  },
                  {
                    type: "div" as const,
                    props: {
                      style: {
                        fontSize: 26,
                        fontWeight: 600,
                        color: "#2a2a2a",
                        lineHeight: 1.4,
                        paddingTop: 2,
                      },
                      children: line,
                    },
                  },
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
  // Legacy alias
  bullets: EditorialTemplate,
};

/**
 * Pick the best template based on the AI-generated visual_style and content.
 */
export function suggestTemplate(
  visualStyle: string,
  textOverlay: string,
  textLines: string[]
): PinTemplate {
  // If text overlay starts with a number or $, use stat template
  if (/^[\d$€£%]/.test(textOverlay.trim())) return "stat";

  // If text lines look like numbered tips (3+ lines)
  if (textLines.length >= 3) {
    const hasNumbered = textLines.some((l) => /^\d/.test(l.trim()));
    if (hasNumbered) return "tips";
  }

  // Map visual styles to templates
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

  // Resolve legacy aliases
  const resolvedTemplate = input.template in templates ? input.template : "hero";
  const templateFn = templates[resolvedTemplate];
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

  // Convert SVG to JPEG via sharp
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
