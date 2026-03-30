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
  const systemPrompt = `You are an expert commercial photographer and art director who writes image generation prompts. Your goal is to create prompts that produce PHOTOREALISTIC images indistinguishable from real professional photography.

CRITICAL REALISM RULES — every prompt MUST follow these:
- ALWAYS start the prompt with "Professional DSLR photograph, shot on Canon EOS R5 with 85mm f/1.4 lens"
- NEVER use words: "illustration", "digital art", "painting", "rendered", "3D", "cartoon", "artistic", "fantasy", "dreamy", "whimsical", "magical"
- NEVER include text overlays, typography, or words burned into the image — text will be added separately in post-production
- ALWAYS specify: exact camera settings (aperture, focal length), real lighting conditions, physical materials and textures
- ALWAYS describe the scene as if directing a real photoshoot with a real product on a real set
- Use photography terminology: "shallow depth of field", "bokeh background", "soft window light", "reflector fill", "overhead diffused lighting"
- Describe real physical materials: "oak wood table", "linen cloth", "marble countertop", "concrete surface", "weathered pine"
- Include realistic imperfections: "slight lens vignette", "natural color cast from window light", "subtle shadow gradients"
- Specify the exact time of day and light source: "late afternoon golden hour through large west-facing window", "overcast soft daylight"
- For product shots: describe the product placement, angle, and surroundings as a real styled photoshoot
- For lifestyle shots: describe a real location (kitchen, studio, park bench, cafe table) with real props
- Keep all details grounded in physical reality — nothing that couldn't exist in a real photo
- Compose for 2:3 aspect ratio (1000x1500px) — vertical Pinterest format
- IMPORTANT: For fashion/lingerie brands, focus on lifestyle scenes, fashion styling, outfit inspiration, confidence imagery. NEVER describe underwear, bras, or intimate apparel directly — use "fashion flat lay", "style essentials", "wardrobe basics" instead.

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

  const userPrompt = `Generate an image prompt for this pin:

Product: ${input.productTitle}
Visual Style: ${input.pinContent.visual_style}
Text Overlay: "${input.pinContent.text_overlay}"
Pin Title: ${input.pinContent.title}
Keywords: ${input.pinContent.keywords.join(", ")}

Brand: ${input.brand.name}
${styleDesc || "No specific brand style defined"}

${input.productImages.length ? `Reference product images available: ${input.productImages.map((i) => i.alt || "product photo").join(", ")}` : "No product images available — create a conceptual/lifestyle image"}

Create a photorealistic image generation prompt for a vertical Pinterest pin (2:3 ratio). The image must look like it was taken by a professional photographer with a real camera on a real set. NO AI artifacts, NO text in the image, NO illustration style. Think: a commercial product photoshoot for a premium brand lookbook.${
    input.styleGuideRules?.length
      ? `\n\nStyle guide rules (apply these to the image):\n${input.styleGuideRules.map((r) => `- ${r}`).join("\n")}`
      : ""
  }`;

  return { systemPrompt, userPrompt };
}
