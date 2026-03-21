import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { ShopifyClient } from "@/lib/shopify/client";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("shopify_domain, shopify_token_encrypted")
    .eq("id", profile.org_id)
    .single();

  if (!org?.shopify_domain || !org?.shopify_token_encrypted) {
    return NextResponse.json(
      { error: "Shopify not connected" },
      { status: 400 }
    );
  }

  const token = decrypt(org.shopify_token_encrypted);
  const client = new ShopifyClient(org.shopify_domain, token);

  const { products } = await client.getProducts();

  let upserted = 0;
  for (const product of products) {
    const images = product.images.map((img) => ({
      url: img.src,
      alt: img.alt || "",
      position: img.position,
    }));

    const variants = product.variants.map((v) => {
      const variantImage = product.images.find(
        (img) => img.id === v.image_id
      );
      return {
        title: v.title,
        price: v.price,
        sku: v.sku || "",
        image_url: variantImage?.src || null,
      };
    });

    const { error } = await supabase.from("products").upsert(
      {
        org_id: profile.org_id,
        shopify_product_id: String(product.id),
        title: product.title,
        description: product.body_html,
        product_type: product.product_type || null,
        vendor: product.vendor || null,
        tags: product.tags ? product.tags.split(", ") : [],
        images,
        variants,
        status: product.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,shopify_product_id" }
    );

    if (!error) upserted++;
  }

  return NextResponse.json({ success: true, synced: upserted, total: products.length });
}
