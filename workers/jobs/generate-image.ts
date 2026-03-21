import type { Job } from "bullmq";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { decrypt } from "../../src/lib/encryption";
import { KreaClient } from "../../src/lib/krea/client";

interface GenerateImageData {
  pinId: string;
  orgId: string;
}

const POLL_INTERVAL = 5000;
const MAX_POLLS = 60; // 5 minutes max

export async function processGenerateImage(job: Job<GenerateImageData>) {
  const { pinId, orgId } = job.data;
  const supabase = createAdminClient();

  // Load pin
  const { data: pin } = await supabase
    .from("pins")
    .select("id, generation_prompt")
    .eq("id", pinId)
    .single();

  if (!pin?.generation_prompt) {
    throw new Error(`Pin ${pinId} has no generation prompt`);
  }

  // Load org krea key
  const { data: org } = await supabase
    .from("organizations")
    .select("id, krea_api_key_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.krea_api_key_encrypted) {
    throw new Error(`No kie.ai API key for org ${orgId}`);
  }

  const apiKey = decrypt(org.krea_api_key_encrypted);
  const krea = new KreaClient(apiKey);

  // Start generation
  const task = await krea.generateImage({
    model: "nano-banana-2",
    prompt: pin.generation_prompt,
    aspect_ratio: "2:3",
    width: 1000,
    height: 1500,
    webhook_url: process.env.KREA_WEBHOOK_URL || undefined,
  });

  // Save krea_job_id
  await supabase
    .from("pins")
    .update({ krea_job_id: task.id })
    .eq("id", pinId);

  // If no webhook, poll for completion
  if (!process.env.KREA_WEBHOOK_URL) {
    let status = task.status;
    let polls = 0;

    while (status !== "completed" && status !== "failed" && polls < MAX_POLLS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const updated = await krea.getTaskStatus(task.id);
      status = updated.status;
      polls++;

      if (status === "completed" && updated.result?.url) {
        await supabase
          .from("pins")
          .update({ image_url: updated.result.url, status: "generated" })
          .eq("id", pinId);

        return { imageUrl: updated.result.url };
      }

      if (status === "failed") {
        throw new Error(`Image generation failed: ${updated.error || "unknown error"}`);
      }
    }

    if (polls >= MAX_POLLS) {
      throw new Error(`Image generation timed out for pin ${pinId}`);
    }
  }

  return { taskId: task.id, status: "processing" };
}
