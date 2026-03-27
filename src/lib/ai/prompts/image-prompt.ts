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
  const systemPrompt = `You are an expert at writing image generation prompts for NanoBanana 2 (kie.ai). Create detailed, specific prompts that produce stunning Pinterest-optimized product images.

Prompt writing rules:
- Output a single "prompt" string — this is the full image generation prompt
- Compose for 2:3 aspect ratio (1000x1500px) — vertical Pinterest format
- Be extremely specific about composition, lighting, colors, and mood
- Include the brand's color palette naturally in the scene
- Specify text overlay placement (top third or bottom third, never center)
- Include the exact text overlay content in quotes
- Describe photography/design style explicitly (e.g. "editorial product photography", "minimal flat lay", "lifestyle photo")
- Mention specific lighting (soft natural light, studio, golden hour, etc.)
- Include depth of field and camera angle suggestions
- For lifestyle shots: describe the setting, props, and mood
- For flat lays: describe surface texture, arrangement, and negative space
- Never reference specific real people or copyrighted characters
- Keep the prompt under 500 words but be detailed

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

Create a detailed image generation prompt optimized for a vertical Pinterest pin (2:3 ratio). The image should stop the scroll and drive engagement.${
    input.styleGuideRules?.length
      ? `\n\nStyle guide rules (apply these to the image):\n${input.styleGuideRules.map((r) => `- ${r}`).join("\n")}`
      : ""
  }`;

  return { systemPrompt, userPrompt };
}
