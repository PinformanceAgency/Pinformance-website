import type { PinContentOutput } from "./pin-content";

interface BrandStyle {
  primaryColor?: string;
  secondaryColor?: string;
  fontStyle?: string;
  aesthetic?: string;
  logoUrl?: string;
}

interface ImagePromptInput {
  pinContent: PinContentOutput;
  productTitle: string;
  productImages: { url: string; alt: string }[];
  brand: {
    name: string;
    style: BrandStyle;
  };
  styleGuideRules?: string[];
}

export interface ImagePromptOutput {
  prompt: string;
}

export function imagePromptPrompts(input: ImagePromptInput) {
  const systemPrompt = `You are an expert commercial photographer and Pinterest creative director. You create image generation prompts that produce PHOTOREALISTIC product images with clean, professional text overlays — exactly like high-performing Pinterest pins.

PHOTOREALISM RULES:
- ALWAYS start the prompt with "Professional DSLR product photograph, shot on Canon EOS R5 with 85mm f/1.4 lens"
- NEVER use: "illustration", "digital art", "painting", "rendered", "3D", "cartoon", "artistic", "fantasy", "dreamy", "whimsical", "magical"
- Use real photography terminology: "shallow depth of field", "bokeh background", "soft window light", "overhead diffused lighting"
- Describe real materials: "oak wood table", "linen cloth", "marble countertop", "concrete surface"
- Include realistic lighting: specify time of day, light source, direction
- For product shots: real styled photoshoot with props, surfaces, environment
- For lifestyle shots: real locations (cafe, studio, park, kitchen) with real props
- Keep all details grounded in physical reality

TEXT OVERLAY RULES (CRITICAL — Pinterest best practice):
- ALWAYS include a clear, bold text overlay on the image
- The text overlay should display the KEY MESSAGE or BENEFIT provided
- Place the text in the TOP THIRD or BOTTOM THIRD of the image (never dead center)
- Describe the text as: "clean white bold sans-serif text overlay reading [EXACT TEXT]"
- The text should be large enough to read on mobile (Pinterest is 80% mobile)
- Use a subtle semi-transparent dark gradient or blur behind text for readability
- The brand name or logo should appear small in a corner (top-left or bottom-right)

BRANDING RULES:
- Include the brand name "${input.brand.name}" subtly in the image (small logo placement or text)
- Use the brand's color palette in the scene styling and text accents
- The overall look should feel premium, trustworthy, and on-brand

COMPOSITION:
- 2:3 vertical aspect ratio (1000x1500px) — Pinterest optimal format
- Product should be the hero — clearly visible and well-lit
- Leave breathing room for the text overlay (don't overcrowd)
- The image should stop the scroll — vibrant, high-contrast, eye-catching

IMPORTANT: For fashion/lingerie brands, focus on lifestyle scenes, fashion styling, outfit coordination, confidence imagery. NEVER describe underwear, bras, or intimate apparel directly — use "fashion flat lay", "style essentials", "wardrobe basics" instead.

Output valid JSON:
{
  "prompt": string
}`;

  const styleDesc = [
    input.brand.style.aesthetic && `Brand aesthetic: ${input.brand.style.aesthetic}`,
    input.brand.style.primaryColor && `Primary color: ${input.brand.style.primaryColor}`,
    input.brand.style.secondaryColor && `Secondary color: ${input.brand.style.secondaryColor}`,
    input.brand.style.fontStyle && `Font style: ${input.brand.style.fontStyle}`,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = `Generate a Pinterest-optimized image prompt for this pin:

Product: ${input.productTitle}
Visual Style: ${input.pinContent.visual_style}
Text Overlay Message: "${input.pinContent.text_overlay}"
Pin Title: ${input.pinContent.title}
Keywords: ${input.pinContent.keywords.join(", ")}

Brand: ${input.brand.name}
${styleDesc || "No specific brand style defined"}

${input.productImages.length ? `Reference product images available: ${input.productImages.map((i) => i.alt || "product photo").join(", ")}` : "No product images available — create a conceptual/lifestyle image"}

Create a photorealistic image prompt that:
1. Shows the product in a real, styled photoshoot setting
2. Includes a CLEAR TEXT OVERLAY with the message: "${input.pinContent.text_overlay}"
3. Has the brand name "${input.brand.name}" visible (small logo/text in corner)
4. Looks like a professional Pinterest pin that drives clicks and saves
5. Is photorealistic — no AI artifacts, no illustration style${
    input.styleGuideRules?.length
      ? `\n\nStyle guide rules (apply these to the image):\n${input.styleGuideRules.map((r) => `- ${r}`).join("\n")}`
      : ""
  }`;

  return { systemPrompt, userPrompt };
}
