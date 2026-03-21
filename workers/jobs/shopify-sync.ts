import type { Job } from "bullmq";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { decrypt } from "../../src/lib/encryption";
import { ShopifyClient } from "../../src/lib/shopify/client";

interface ShopifySyncData {
  orgId: string;
}

export async function processShopifySync(job: Job<ShopifySyncData>) {
  const { orgId } = job.data;
  const supabase = createAdminClient();

  // Load org
  const { data: org } = await supabase
    .from("organizations")
    .select("id, shopify_domain, shopify_token_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.shopify_domain || !org?.shopify_token_encrypted) {
    throw new Error(`No Shopify credentials for org ${orgId}`);
  }

  const accessToken = decrypt(org.shopify_token_encrypted);
  const client = new ShopifyClient(org.shopify_domain, accessToken);

  const { products } = await client.getProducts();

  let upserted = 0;

  for (const product of products) {
    await supabase.from("products").upsert(
      {
        org_id: orgId,
        shopify_product_id: String(product.id),
        title: product.title,
        description: product.body_html?.replace(/<[^>]*>/g, "") || null,
        product_type: product.product_type || null,
        vendor: product.vendor || null,
        tags: product.tags ? product.tags.split(", ") : [],
        images: (product.images || []).map((img: any, i: number) => ({
          url: img.src,
          alt: img.alt || "",
          position: i,
        })),
        variants: (product.variants || []).map((v: any) => ({
          title: v.title,
          price: v.price,
          sku: v.sku || "",
          image_url: v.image_id ? product.images?.find((i: any) => i.id === v.image_id)?.src : null,
        })),
        collections: [],
        status: product.status === "active" ? "active" : "draft",
      },
      { onConflict: "org_id,shopify_product_id" }
    );
    upserted++;
  }

  return { synced: upserted, total: products.length };
}
