import type { Job } from "bullmq";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { generateJSON } from "../../src/lib/ai/client";

interface ParseBrandDocData {
  orgId: string;
  filePath: string;
  fileName: string;
}

interface BrandDocOutput {
  brand_name: string;
  tagline: string | null;
  description: string;
  target_audience: string;
  brand_voice: string;
  unique_selling_points: string[];
  brand_values: string[];
  brand_style: {
    primary_color: string | null;
    secondary_color: string | null;
    font_style: string | null;
    aesthetic: string | null;
  };
  competitors: string[];
  key_products: string[];
}

export async function processParseBrandDoc(job: Job<ParseBrandDocData>) {
  const { orgId, filePath, fileName } = job.data;
  const supabase = createAdminClient();

  // Download file from Supabase Storage
  const { data: fileData, error } = await supabase.storage
    .from("brand-documents")
    .download(filePath);

  if (error || !fileData) {
    throw new Error(`Failed to download file: ${error?.message || "unknown"}`);
  }

  let text: string;

  if (fileName.endsWith(".pdf")) {
    // Simple PDF text extraction — read raw text content
    // For production, use a proper PDF parser like pdf-parse
    const buffer = Buffer.from(await fileData.arrayBuffer());
    text = extractTextFromPDF(buffer);
  } else {
    text = await fileData.text();
  }

  if (!text.trim()) {
    throw new Error("Could not extract text from uploaded document");
  }

  // Send to Claude for structured summary
  const systemPrompt = `You are a brand analyst. Extract structured brand information from the provided document. Be thorough and capture all brand details mentioned.

Output valid JSON matching this schema:
{
  "brand_name": string,
  "tagline": string | null,
  "description": string,
  "target_audience": string,
  "brand_voice": string (e.g. "playful and bold", "sophisticated and minimal"),
  "unique_selling_points": string[],
  "brand_values": string[],
  "brand_style": {
    "primary_color": string | null (hex or name),
    "secondary_color": string | null,
    "font_style": string | null,
    "aesthetic": string | null
  },
  "competitors": string[],
  "key_products": string[]
}`;

  const result = await generateJSON<BrandDocOutput>(
    systemPrompt,
    `Extract brand information from this document:\n\n${text.slice(0, 15000)}`
  );

  // Update brand_profiles with structured data
  await supabase
    .from("brand_profiles")
    .update({
      structured_data: result,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);

  return { parsed: true, brandName: result.brand_name };
}

function extractTextFromPDF(buffer: Buffer): string {
  // Simple approach: extract readable strings from PDF binary
  // This handles basic text PDFs; for complex PDFs, use pdf-parse package
  const text = buffer.toString("utf-8");
  const readable = text
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return readable;
}
