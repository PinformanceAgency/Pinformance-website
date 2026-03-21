import type { Job } from "bullmq";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { decrypt, encrypt } from "../../src/lib/encryption";
import { PinterestClient } from "../../src/lib/pinterest/client";

interface RefreshTokenData {
  orgId: string;
}

export async function processRefreshPinterestToken(job: Job<RefreshTokenData>) {
  const { orgId } = job.data;
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, pinterest_refresh_token_encrypted, pinterest_token_expires_at")
    .eq("id", orgId)
    .single();

  if (!org?.pinterest_refresh_token_encrypted) {
    throw new Error(`No Pinterest refresh token for org ${orgId}`);
  }

  const refreshToken = decrypt(org.pinterest_refresh_token_encrypted);
  const tokens = await PinterestClient.refreshToken(refreshToken);

  // Calculate new expiry
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Store encrypted tokens
  await supabase
    .from("organizations")
    .update({
      pinterest_token_encrypted: encrypt(tokens.access_token),
      pinterest_refresh_token_encrypted: encrypt(tokens.refresh_token),
      pinterest_token_expires_at: expiresAt,
    })
    .eq("id", orgId);

  console.log(`Refreshed Pinterest token for org ${orgId}, expires ${expiresAt}`);

  return { expiresAt };
}
