import type { Job } from "bullmq";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { decrypt } from "../../src/lib/encryption";
import { PinterestClient } from "../../src/lib/pinterest/client";
import { checkRateLimit, recordPost } from "../lib/rate-limiter";

interface PostPinData {
  pinId: string;
  orgId: string;
}

export async function processPostPin(job: Job<PostPinData>) {
  const { pinId, orgId } = job.data;
  const supabase = createAdminClient();

  // Load pin
  const { data: pin } = await supabase
    .from("pins")
    .select("*, boards(*)")
    .eq("id", pinId)
    .single();

  if (!pin) throw new Error(`Pin ${pinId} not found`);
  if (!pin.image_url) throw new Error(`Pin ${pinId} has no image`);

  // Load org tokens
  const { data: org } = await supabase
    .from("organizations")
    .select("id, pinterest_token_encrypted, pinterest_user_id")
    .eq("id", orgId)
    .single();

  if (!org?.pinterest_token_encrypted) {
    throw new Error(`No Pinterest token for org ${orgId}`);
  }

  // Check rate limits
  const canPost = await checkRateLimit(orgId);
  if (!canPost) {
    // Retry in 3 minutes
    throw new Error("Rate limited — will retry");
  }

  // Update status to posting
  await supabase.from("pins").update({ status: "posting" }).eq("id", pinId);

  try {
    const accessToken = decrypt(org.pinterest_token_encrypted);
    const client = new PinterestClient(accessToken);

    const result = await client.createPin({
      board_id: pin.boards.pinterest_board_id,
      board_section_id: pin.board_section_id || undefined,
      title: pin.title,
      description: pin.description || undefined,
      link: pin.link_url || undefined,
      alt_text: pin.alt_text || undefined,
      media_source: {
        source_type: "image_url",
        url: pin.image_url,
      },
    });

    // Update pin as posted
    await supabase
      .from("pins")
      .update({
        status: "posted",
        pinterest_pin_id: result.id,
        posted_at: new Date().toISOString(),
      })
      .eq("id", pinId);

    await recordPost(orgId);

    return { pinterestPinId: result.id };
  } catch (error) {
    await supabase
      .from("pins")
      .update({ status: "failed" })
      .eq("id", pinId);

    throw error;
  }
}
