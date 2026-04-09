import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";
import { runStrategyPipeline } from "@/lib/ai/pipelines/strategy-pipeline";
import { runContentPipeline } from "@/lib/ai/pipelines/content-pipeline";
import { KreaClient } from "@/lib/krea/client";
import { PinterestClient } from "@/lib/pinterest/client";
import { ShopifyClient } from "@/lib/shopify/client";

/**
 * Test/diagnostic endpoint for running the full pipeline for a specific org.
 * Authenticated via CRON_SECRET to avoid needing a user session.
 *
 * Usage: POST /api/pipeline/test
 * Headers: { "x-cron-secret": "..." }
 * Body: { "org_slug": "fit-cherries", "step": "diagnose" | "strategy" | "content" | "full" }
 */
export const maxDuration = 300; // 5 minutes for pipeline operations

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== (process.env.CRON_SECRET || process.env.CRON_SET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { org_slug, step = "diagnose" } = body;

  if (!org_slug) {
    return NextResponse.json({ error: "org_slug is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find org
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", org_slug)
    .single();

  if (!org || orgError) {
    return NextResponse.json({ error: `Organization '${org_slug}' not found`, detail: orgError }, { status: 404 });
  }

  // Get per-org Anthropic key (or force global key via body param)
  let anthropicApiKey: string | undefined;
  if (!body.use_global_key && org.anthropic_api_key_encrypted) {
    try {
      anthropicApiKey = decrypt(org.anthropic_api_key_encrypted);
    } catch {
      // fall back to global
    }
  }

  // === DIAGNOSE: Check what data exists ===
  const [brandRes, productsRes, boardsRes, keywordsRes, pinsRes, feedbackRes] = await Promise.all([
    supabase.from("brand_profiles").select("*").eq("org_id", org.id).single(),
    supabase.from("products").select("id, title, status, product_type, tags, collections, images, shopify_product_id").eq("org_id", org.id),
    supabase.from("boards").select("id, name, status, keywords, category").eq("org_id", org.id),
    supabase.from("keywords").select("id, keyword, category, performance_score").eq("org_id", org.id).limit(20),
    supabase.from("pins").select("id, title, status, board_id, scheduled_at, generation_prompt, image_url").eq("org_id", org.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("feedback_rules").select("*").eq("org_id", org.id).eq("is_active", true),
  ]);

  const diagnosis = {
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      pinterest_connected: !!org.pinterest_user_id,
      pinterest_user: org.pinterest_user_id || null,
      pinterest_token_valid: org.pinterest_token_expires_at ? new Date(org.pinterest_token_expires_at) > new Date() : false,
      shopify_connected: !!org.shopify_domain,
      shopify_domain: org.shopify_domain || null,
      anthropic_key_source: org.anthropic_api_key_encrypted ? "per-org (encrypted)" : "no per-org key",
      anthropic_global_env: process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...)` : "MISSING",
      krea_key: org.krea_api_key_encrypted ? "per-org (encrypted)" : process.env.KREA_API_KEY ? "global env" : "MISSING",
      settings: org.settings,
    },
    brand_profile: brandRes.data
      ? {
          exists: true,
          has_raw_data: !!brandRes.data.raw_data,
          has_structured_data: !!brandRes.data.structured_data,
          brand_voice: brandRes.data.brand_voice || brandRes.data.structured_data?.brand_voice || "not set",
          industry: brandRes.data.raw_data?.industry || "not set",
        }
      : { exists: false, message: "NO BRAND PROFILE — strategy pipeline will fail" },
    products: {
      count: productsRes.data?.length || 0,
      active: productsRes.data?.filter((p) => p.status === "active").length || 0,
      items: productsRes.data?.slice(0, 5).map(p => ({ ...p, images: (p.images as unknown[])?.slice(0, 3) })) || [],
      watercolor_products: productsRes.data?.filter(p => p.title?.toLowerCase().includes("watercolor") || p.title?.toLowerCase().includes("tobio")).map(p => ({ id: p.id, title: p.title, shopify_product_id: p.shopify_product_id, image_count: (p.images as unknown[])?.length || 0, first_image: (p.images as { url: string }[])?.[0]?.url })) || [],
      message: !productsRes.data?.length ? "NO PRODUCTS — content pipeline will fail. Add products manually or connect Shopify." : "OK",
    },
    boards: {
      count: boardsRes.data?.length || 0,
      items: boardsRes.data || [],
      message: !boardsRes.data?.length ? "No boards — run strategy pipeline first" : "OK",
    },
    keywords: {
      count: keywordsRes.data?.length || 0,
      sample: keywordsRes.data?.slice(0, 10) || [],
      message: !keywordsRes.data?.length ? "No keywords — run strategy pipeline first" : "OK",
    },
    pins: {
      count: pinsRes.data?.length || 0,
      by_status: groupByStatus(pinsRes.data || []),
      recent: pinsRes.data?.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        has_image_prompt: !!p.generation_prompt,
        has_image: !!p.image_url,
        scheduled_at: p.scheduled_at,
      })) || [],
    },
    feedback_rules: {
      count: feedbackRes.data?.length || 0,
      rules: feedbackRes.data || [],
    },
    readiness: {
      strategy_pipeline: brandRes.data ? "READY" : "BLOCKED — needs brand_profile",
      content_pipeline: (boardsRes.data?.length || 0) > 0 && (productsRes.data?.filter((p) => p.status === "active").length || 0) > 0
        ? "READY"
        : `BLOCKED — needs ${!boardsRes.data?.length ? "boards (run strategy first)" : ""} ${!(productsRes.data?.filter((p) => p.status === "active").length) ? "products" : ""}`.trim(),
      image_generation: "Requires Krea API key",
      posting: org.pinterest_user_id && org.pinterest_token_expires_at && new Date(org.pinterest_token_expires_at) > new Date()
        ? "READY"
        : "BLOCKED — Pinterest not connected or token expired",
    },
  };

  if (step === "diagnose") {
    return NextResponse.json({ success: true, step: "diagnose", diagnosis });
  }

  // === RESET: Clear all generated data for this org ===
  if (step === "reset") {
    const tables = ["pins", "calendar_entries", "keywords", "boards", "products", "brand_profiles", "ai_tasks", "feedback_rules"];
    const results: Record<string, string> = {};
    for (const table of tables) {
      const { error, count } = await supabase.from(table).delete().eq("org_id", org.id);
      results[table] = error ? error.message : `deleted`;
    }
    return NextResponse.json({ success: true, step: "reset", results });
  }

  // === UPDATE-SETTINGS: Update org settings ===
  if (step === "update-settings") {
    const { settings } = body;
    if (!settings) return NextResponse.json({ error: "settings object required" }, { status: 400 });
    // Merge with existing settings
    const merged = { ...(org.settings || {}), ...settings };
    const { error } = await supabase.from("organizations").update({ settings: merged }).eq("id", org.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, step: "update-settings", settings: merged });
  }

  // === UPDATE-KEY: Update per-org API key ===
  if (step === "update-key") {
    const { anthropic_api_key, krea_api_key } = body;
    const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
    if (anthropic_api_key) updatePayload.anthropic_api_key_encrypted = encrypt(anthropic_api_key);
    if (krea_api_key) updatePayload.krea_api_key_encrypted = encrypt(krea_api_key);
    const { error } = await supabase.from("organizations").update(updatePayload).eq("id", org.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, step: "update-key", updated: Object.keys(updatePayload).filter(k => k !== "updated_at") });
  }

  // === SEED: Create brand profile and test products ===
  if (step === "seed") {
    const { brand_profile, products } = body;

    if (brand_profile) {
      // Build upsert data with only columns that exist
      const bpData: Record<string, unknown> = {
        org_id: org.id,
        raw_data: {
          website: brand_profile.website || "",
          industry: brand_profile.industry || "",
          description: brand_profile.description || "",
          brand_style: brand_profile.brand_style || "",
        },
      };
      // Add optional columns if they exist in schema
      if (brand_profile.brand_voice) bpData.brand_voice = brand_profile.brand_voice;
      if (brand_profile.target_audience) bpData.target_audience = brand_profile.target_audience;
      if (brand_profile.color_palette) bpData.color_palette = brand_profile.color_palette;
      if (brand_profile.tone_keywords) bpData.tone_keywords = brand_profile.tone_keywords;
      if (brand_profile.avoid_keywords) bpData.avoid_keywords = brand_profile.avoid_keywords;

      const { error: bpError } = await supabase
        .from("brand_profiles")
        .upsert(bpData, { onConflict: "org_id" });

      if (bpError) {
        return NextResponse.json({ success: false, step: "seed", error: "Failed to create brand profile", detail: bpError }, { status: 500 });
      }
    }

    if (products?.length) {
      const productRows = products.map((p: Record<string, unknown>) => ({
        org_id: org.id,
        title: p.title,
        description: p.description || "",
        product_type: p.product_type || "general",
        tags: p.tags || [],
        images: p.images || [],
        variants: p.variants || [],
        status: "active",
      }));

      const { error: prodError } = await supabase.from("products").insert(productRows);
      if (prodError) {
        return NextResponse.json({ success: false, step: "seed", error: "Failed to create products", detail: prodError }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      step: "seed",
      message: `Seeded brand profile: ${!!brand_profile}, products: ${products?.length || 0}`,
    });
  }

  // === STRATEGY: Run strategy pipeline ===
  if (step === "strategy" || step === "full") {
    if (!brandRes.data) {
      return NextResponse.json({
        success: false,
        step: "strategy",
        error: "No brand profile found. Create one first.",
        diagnosis,
      }, { status: 400 });
    }

    try {
      const strategyResult = await runStrategyPipeline(org.id, anthropicApiKey);

      // Refresh boards/keywords after strategy
      const [newBoards, newKeywords] = await Promise.all([
        supabase.from("boards").select("id, name, status, keywords, category").eq("org_id", org.id),
        supabase.from("keywords").select("id, keyword, category").eq("org_id", org.id).limit(30),
      ]);

      if (step === "strategy") {
        return NextResponse.json({
          success: true,
          step: "strategy",
          result: {
            keywords_generated: strategyResult.keywordStrategy.primary_keywords.length +
              strategyResult.keywordStrategy.secondary_keywords.length +
              strategyResult.keywordStrategy.long_tail_keywords.length,
            boards_generated: strategyResult.boardPlan.boards.length,
            boards: newBoards.data?.map((b) => ({ name: b.name, category: b.category, keywords: b.keywords })),
            keyword_sample: newKeywords.data?.slice(0, 15),
          },
        });
      }

      // Continue to content if "full"
    } catch (err) {
      return NextResponse.json({
        success: false,
        step: "strategy",
        error: err instanceof Error ? err.message : "Strategy pipeline failed",
      }, { status: 500 });
    }
  }

  // === CONTENT: Run content pipeline ===
  if (step === "content" || step === "full") {
    // Check prerequisites
    const { data: currentBoards } = await supabase.from("boards").select("id").eq("org_id", org.id);
    const { data: currentProducts } = await supabase.from("products").select("id").eq("org_id", org.id).eq("status", "active");

    if (!currentBoards?.length) {
      return NextResponse.json({
        success: false,
        step: "content",
        error: "No boards found. Run strategy pipeline first.",
      }, { status: 400 });
    }

    if (!currentProducts?.length) {
      return NextResponse.json({
        success: false,
        step: "content",
        error: "No products found. Add products manually or connect Shopify.",
      }, { status: 400 });
    }

    try {
      const days = body.days || 1;
      const contentMode = body.mode || "daily"; // "seed" = 5 pins per board, "daily" = 1 pin/day
      const pinsPerBoard = body.pins_per_board || 5;
      const contentResult = await runContentPipeline(org.id, days, anthropicApiKey, contentMode, pinsPerBoard);

      // Get created pins
      const { data: newPins } = await supabase
        .from("pins")
        .select("id, title, description, status, board_id, generation_prompt, scheduled_at, keywords")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(10);

      return NextResponse.json({
        success: true,
        step: step === "full" ? "full" : "content",
        result: {
          pins_created: contentResult.pinsCreated,
          days_planned: contentResult.daysPlanned,
          sample_pins: newPins?.slice(0, 5).map((p) => ({
            title: p.title,
            description: p.description?.substring(0, 100) + "...",
            status: p.status,
            keywords: p.keywords,
            has_image_prompt: !!p.generation_prompt,
            scheduled_at: p.scheduled_at,
          })),
        },
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        step: "content",
        error: err instanceof Error ? err.message : "Content pipeline failed",
      }, { status: 500 });
    }
  }

  // === GENERATE-IMAGE: Generate Krea AI image for 1 pin ===
  if (step === "generate-image") {
    const pinId = body.pin_id;

    // Get a pin that has a generation_prompt but no image
    let pin;
    if (pinId) {
      const { data } = await supabase.from("pins").select("*").eq("id", pinId).eq("org_id", org.id).single();
      pin = data;
    } else {
      // Use or filter since .in() can be unreliable with .single()
      const { data, error: pinErr } = await supabase
        .from("pins")
        .select("*")
        .eq("org_id", org.id)
        .or("status.eq.generated,status.eq.scheduled,status.eq.approved")
        .is("image_url", null)
        .not("generation_prompt", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(1);
      pin = data?.[0] || null;
      if (pinErr) console.error("Pin query error:", pinErr);
    }

    if (!pin) {
      return NextResponse.json({ success: false, error: "No pin found with generation_prompt and no image" }, { status: 404 });
    }

    // Get Krea API key
    let kreaKey: string | undefined;
    if (org.krea_api_key_encrypted) {
      try { kreaKey = decrypt(org.krea_api_key_encrypted); } catch {}
    }
    if (!kreaKey) kreaKey = process.env.KREA_API_KEY;
    if (!kreaKey) {
      return NextResponse.json({ success: false, error: "No Krea API key found" }, { status: 400 });
    }

    try {
      const krea = new KreaClient(kreaKey);
      const result = await krea.generateImage({
        prompt: pin.generation_prompt,
        width: 1000,
        height: 1500,
      });

      const taskId = result.id || result.task_id;
      if (!taskId) {
        return NextResponse.json({ success: false, step: "generate-image", error: "No job_id returned from Krea" }, { status: 500 });
      }

      // Poll for completion (max 90 seconds)
      let imageUrl: string | null = null;
      let finalStatus = "processing";

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const status = await krea.getTaskStatus(taskId);
        if (status.status === "completed" && status.result?.url) {
          imageUrl = status.result.url;
          finalStatus = "completed";
          break;
        }
        if (status.status === "failed") {
          return NextResponse.json({ success: false, step: "generate-image", error: `Image generation failed: ${JSON.stringify(status)}` }, { status: 500 });
        }
      }

      if (imageUrl) {
        await supabase.from("pins").update({ image_url: imageUrl, krea_job_id: taskId }).eq("id", pin.id);
      }

      return NextResponse.json({
        success: true,
        step: "generate-image",
        pin_id: pin.id,
        title: pin.title,
        image_url: imageUrl,
        job_id: taskId,
        status: finalStatus,
        prompt_used: pin.generation_prompt?.substring(0, 200) + "...",
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        step: "generate-image",
        error: err instanceof Error ? err.message : "Image generation failed",
      }, { status: 500 });
    }
  }

  // === APPROVE-PIN: Approve a pin for posting ===
  if (step === "approve-pin") {
    const pinId = body.pin_id;
    if (!pinId) {
      // Auto-select first generated pin with an image
      const { data: readyPin } = await supabase
        .from("pins")
        .select("*")
        .eq("org_id", org.id)
        .in("status", ["generated", "scheduled"])
        .not("image_url", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single();

      if (!readyPin) {
        return NextResponse.json({ success: false, error: "No pin with image found to approve" }, { status: 404 });
      }

      const { error } = await supabase.from("pins").update({ status: "approved" }).eq("id", readyPin.id);
      return NextResponse.json({
        success: !error,
        step: "approve-pin",
        pin_id: readyPin.id,
        title: readyPin.title,
        image_url: readyPin.image_url,
        scheduled_at: readyPin.scheduled_at,
        error: error?.message,
      });
    }

    const { error } = await supabase.from("pins").update({ status: "approved" }).eq("id", pinId).eq("org_id", org.id);
    return NextResponse.json({ success: !error, step: "approve-pin", pin_id: pinId, error: error?.message });
  }

  // === POST-PIN: Post an approved pin to Pinterest NOW ===
  if (step === "post-pin") {
    const pinId = body.pin_id;

    let pin;
    if (pinId) {
      const { data } = await supabase.from("pins").select("*, boards(*)").eq("id", pinId).eq("org_id", org.id).single();
      pin = data;
    } else {
      const { data } = await supabase
        .from("pins")
        .select("*, boards(*)")
        .eq("org_id", org.id)
        .eq("status", "approved")
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .single();
      pin = data;
    }

    if (!pin) {
      return NextResponse.json({ success: false, error: "No approved pin found to post" }, { status: 404 });
    }

    // Get Pinterest token
    if (!org.pinterest_access_token_encrypted) {
      return NextResponse.json({ success: false, error: "Pinterest not connected" }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = decrypt(org.pinterest_access_token_encrypted);
    } catch {
      return NextResponse.json({ success: false, error: "Failed to decrypt Pinterest token" }, { status: 500 });
    }

    // Auto-refresh token if expired or about to expire
    const tokenExpiry = org.pinterest_token_expires_at ? new Date(org.pinterest_token_expires_at) : null;
    const isExpiredOrSoon = !tokenExpiry || tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000; // 5 min buffer
    if (isExpiredOrSoon && org.pinterest_refresh_token_encrypted) {
      try {
        const refreshToken = decrypt(org.pinterest_refresh_token_encrypted);
        const newTokens = await PinterestClient.refreshToken(refreshToken);
        accessToken = newTokens.access_token;
        // Save refreshed tokens
        const newExpiry = new Date(Date.now() + (newTokens.expires_in || 2592000) * 1000).toISOString();
        await supabase.from("organizations").update({
          pinterest_access_token_encrypted: encrypt(newTokens.access_token),
          pinterest_refresh_token_encrypted: encrypt(newTokens.refresh_token),
          pinterest_token_expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        }).eq("id", org.id);
      } catch (refreshErr) {
        return NextResponse.json({ success: false, error: `Pinterest token refresh failed: ${refreshErr instanceof Error ? refreshErr.message : "unknown"}. Please reconnect Pinterest.` }, { status: 401 });
      }
    }

    // Use production API by default (sandbox gives 401 with standard access tokens)
    const useSandbox = body.sandbox === true;
    const pinterest = new PinterestClient(accessToken, useSandbox);

    try {
      // First check if board exists on Pinterest, if not create it
      let pinterestBoardId = pin.boards?.pinterest_board_id;

      if (!pinterestBoardId && pin.boards) {
        // Create the board on Pinterest first
        const newBoard = await pinterest.createBoard({
          name: pin.boards.name,
          description: pin.boards.description || "",
          privacy: "PUBLIC",
        });
        pinterestBoardId = newBoard.id;
        await supabase.from("boards").update({ pinterest_board_id: newBoard.id, status: "active" }).eq("id", pin.boards.id);
      }

      if (!pinterestBoardId) {
        return NextResponse.json({ success: false, error: "No Pinterest board ID. Board needs to be created first." }, { status: 400 });
      }

      // Mark as posting
      await supabase.from("pins").update({ status: "posting" }).eq("id", pin.id);

      // Ensure link_url is a valid full URL
      let linkUrl = pin.link_url || undefined;
      // Always prefer brand website over myshopify.com domain
      const { data: bp } = await supabase
        .from("brand_profiles")
        .select("raw_data")
        .eq("org_id", org.id)
        .single();
      const brandWebsite = bp?.raw_data?.website || bp?.raw_data?.landing_page;
      if (linkUrl && !linkUrl.startsWith("http")) {
        if (brandWebsite) {
          linkUrl = `${brandWebsite.replace(/\/$/, "")}${linkUrl.startsWith("/") ? "" : "/"}${linkUrl}`;
        } else if (org.shopify_domain) {
          linkUrl = `https://${org.shopify_domain}${linkUrl.startsWith("/") ? "" : "/"}${linkUrl}`;
        }
      } else if (linkUrl && linkUrl.includes(".myshopify.com") && brandWebsite) {
        // Replace myshopify.com URLs with real brand domain
        const path = new URL(linkUrl).pathname;
        linkUrl = `${brandWebsite.replace(/\/$/, "")}${path}`;
      }

      // Post to Pinterest
      const pinterestPin = await pinterest.createPin({
        board_id: pinterestBoardId,
        title: pin.title,
        description: pin.description,
        link: linkUrl,
        alt_text: pin.alt_text || undefined,
        media_source: {
          source_type: "image_url" as const,
          url: pin.image_url || "",
        },
      });

      // Update pin status
      await supabase.from("pins").update({
        status: "posted",
        pinterest_pin_id: pinterestPin.id,
        posted_at: new Date().toISOString(),
      }).eq("id", pin.id);

      return NextResponse.json({
        success: true,
        step: "post-pin",
        pin_id: pin.id,
        pinterest_pin_id: pinterestPin.id,
        title: pin.title,
        board: pin.boards?.name,
        image_url: pin.image_url,
        link_url: pin.link_url,
      });
    } catch (err) {
      await supabase.from("pins").update({ status: "failed" }).eq("id", pin.id);
      return NextResponse.json({
        success: false,
        step: "post-pin",
        error: err instanceof Error ? err.message : "Posting failed",
      }, { status: 500 });
    }
  }

  // === SYNC-SHOPIFY: Sync products from Shopify ===
  if (step === "sync-shopify") {
    if (!org.shopify_domain || !org.shopify_access_token_encrypted) {
      return NextResponse.json({ success: false, error: "Shopify not connected" }, { status: 400 });
    }
    let shopifyToken: string;
    try {
      shopifyToken = decrypt(org.shopify_access_token_encrypted);
    } catch {
      return NextResponse.json({ success: false, error: "Failed to decrypt Shopify token" }, { status: 500 });
    }
    const shopify = new ShopifyClient(org.shopify_domain, shopifyToken);
    try {
      const { products } = await shopify.getProducts();
      let upserted = 0;
      for (const product of products) {
        const images = (product.images || []).map((img) => ({
          url: img.src, alt: img.alt || "", position: img.position,
        }));
        const variants = (product.variants || []).map((v) => {
          const variantImage = (product.images || []).find((img) => img.id === v.image_id);
          return { title: v.title, price: v.price, sku: v.sku || "", image_url: variantImage?.src || null };
        });
        const { error } = await supabase.from("products").upsert({
          org_id: org.id,
          shopify_product_id: String(product.id),
          title: product.title,
          description: product.body_html,
          product_type: product.product_type || null,
          vendor: product.vendor || null,
          tags: product.tags ? product.tags.split(", ") : [],
          images, variants,
          status: product.status === "active" ? "active" : "inactive",
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,shopify_product_id" });
        if (!error) {
          upserted++;
        } else {
          // Return first error for debugging
          return NextResponse.json({ success: false, step: "sync-shopify", error: `Upsert failed: ${error.message}`, detail: error, product_title: product.title, product_status: product.status, total: products.length });
        }
      }
      return NextResponse.json({ success: true, step: "sync-shopify", synced: upserted, total: products.length, domain: org.shopify_domain, version: "v3" });
    } catch (err) {
      return NextResponse.json({ success: false, step: "sync-shopify", error: err instanceof Error ? err.message : "Shopify sync failed" }, { status: 500 });
    }
  }

  // Save client documents for this org
  if (step === "save-documents") {
    const { documents } = body;
    if (!documents?.length) {
      return NextResponse.json({ error: "documents array is required" }, { status: 400 });
    }
    const rows = documents.map((doc: { title: string; description: string; type?: string; content?: string; url?: string }) => ({
      org_id: org.id,
      title: doc.title,
      description: `${doc.description}${doc.content ? "\n\n" + doc.content : ""}`,
      file_url: doc.url || `text://${doc.type || "document"}`,
      file_type: doc.type || "brand_asset",
    }));
    const { data, error } = await supabase.from("client_documents").insert(rows).select("id, title");
    return NextResponse.json({ success: !error, step: "save-documents", saved: data ?? [], error: error?.message });
  }

  // Reset only pins (keep boards, products, brand profile intact)
  if (step === "reset-pins") {
    const tables = ["pins", "calendar_entries", "ai_tasks"];
    const results: Record<string, string> = {};
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("org_id", org.id);
      results[table] = error ? error.message : "deleted";
    }
    return NextResponse.json({ success: true, step: "reset-pins", results });
  }

  // === UPDATE-PIN-IMAGE: Download external image, upload to Supabase, update pin ===
  if (step === "update-pin-image") {
    const { pin_id, image_url } = body;
    if (!pin_id || !image_url) return NextResponse.json({ error: "pin_id and image_url required" }, { status: 400 });

    try {
      // Download the image
      const imgRes = await fetch(image_url);
      if (!imgRes.ok) throw new Error(`Failed to download: ${imgRes.status}`);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const ext = image_url.includes(".png") ? "png" : "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";

      // Upload to Supabase storage
      const filePath = `${org.id}/pins/${pin_id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("pin-images")
        .upload(filePath, imgBuffer, { contentType, upsert: true });
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      const { data: urlData } = supabase.storage.from("pin-images").getPublicUrl(filePath);

      // Update pin with permanent Supabase URL
      const { error } = await supabase.from("pins")
        .update({ image_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq("id", pin_id).eq("org_id", org.id);

      return NextResponse.json({ success: !error, step: "update-pin-image", pin_id, image_url: urlData.publicUrl, error: error?.message });
    } catch (err) {
      return NextResponse.json({ success: false, step: "update-pin-image", error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  // === SET-PRODUCT-FILTER: Archive all products except specified ones ===
  if (step === "set-product-filter") {
    const { keep_titles } = body;
    if (!keep_titles?.length) return NextResponse.json({ error: "keep_titles array required" }, { status: 400 });

    // Get all products for this org
    const { data: allProducts } = await supabase.from("products").select("id, title").eq("org_id", org.id);
    if (!allProducts) return NextResponse.json({ error: "No products found" }, { status: 404 });

    const keepLower = (keep_titles as string[]).map((t: string) => t.toLowerCase());
    const toArchive: string[] = [];
    const toKeep: string[] = [];

    for (const p of allProducts) {
      const matches = keepLower.some((kt: string) => p.title.toLowerCase().includes(kt));
      if (matches) {
        toKeep.push(p.id);
      } else {
        toArchive.push(p.id);
      }
    }

    if (toArchive.length) {
      await supabase.from("products").update({ status: "archived" }).in("id", toArchive);
    }
    if (toKeep.length) {
      await supabase.from("products").update({ status: "active" }).in("id", toKeep);
    }

    return NextResponse.json({
      success: true, step: "set-product-filter",
      active: toKeep.length, archived: toArchive.length,
      active_products: allProducts.filter(p => toKeep.includes(p.id)).map(p => p.title),
    });
  }

  // Reset onboarding for this org's users
  if (step === "reset-onboarding") {
    const targetStep = body.target_step ?? 0;
    const { data: orgUsers, error: usersErr } = await supabase
      .from("users")
      .update({ onboarding_step: targetStep, onboarding_completed_at: null })
      .eq("org_id", org.id)
      .select("id, email, onboarding_step");

    // Also reset org-level onboarding
    await supabase
      .from("organizations")
      .update({ onboarding_step: targetStep })
      .eq("id", org.id);

    return NextResponse.json({
      success: !usersErr,
      step: "reset-onboarding",
      target_step: targetStep,
      users_updated: orgUsers ?? [],
      error: usersErr?.message,
    });
  }

  // ─── APPROVE ALL ───
  if (step === "approve-all") {
    // Approve pins that have either an image or a video
    const { data: updated, error: approveErr } = await supabase
      .from("pins")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .in("status", ["generated", "scheduled"])
      .or("image_url.not.is.null,video_url.not.is.null")
      .select("id, title, status");

    return NextResponse.json({
      success: !approveErr,
      step: "approve-all",
      approved_count: updated?.length || 0,
      pins: updated?.map(p => ({ id: p.id, title: p.title?.substring(0, 50) })),
      error: approveErr?.message,
    });
  }

  // ─── CREATE ALL DRAFT BOARDS ON PINTEREST ───
  if (step === "create-boards") {
    const { data: draftBoards } = await supabase
      .from("boards")
      .select("*")
      .eq("org_id", org.id)
      .eq("status", "draft");

    if (!draftBoards?.length) {
      return NextResponse.json({ success: true, step: "create-boards", created: 0, message: "No draft boards" });
    }

    if (!org.pinterest_access_token_encrypted) {
      return NextResponse.json({ success: false, step: "create-boards", error: "No Pinterest token" });
    }

    let token: string;
    try {
      token = decrypt(org.pinterest_access_token_encrypted);
    } catch (e) {
      return NextResponse.json({ success: false, step: "create-boards", error: `Token decrypt failed: ${e}` });
    }

    const pinterest = new PinterestClient(token, false);
    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const board of draftBoards) {
      try {
        const pinterestBoard = await pinterest.createBoard({
          name: board.name,
          description: board.description || `${org.name} — ${board.category || "creative"} board`,
          privacy: "PUBLIC",
        });

        await supabase.from("boards").update({
          pinterest_board_id: pinterestBoard.id,
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("id", board.id);

        results.push({ name: board.name, success: true });
      } catch (err) {
        results.push({ name: board.name, success: false, error: err instanceof Error ? err.message : "Failed" });
      }
    }

    return NextResponse.json({ success: true, step: "create-boards", created: results.filter(r => r.success).length, total: draftBoards.length, results });
  }

  // ─── CREATE PIN: Manually create a pin with specific data ───
  if (step === "create-pin") {
    const { pin: pinData } = body;
    if (!pinData) return NextResponse.json({ error: "pin data required" }, { status: 400 });

    // Find best matching board
    const { data: boards } = await supabase.from("boards").select("id, name, keywords").eq("org_id", org.id).eq("status", "active");
    let boardId = pinData.board_id || boards?.[0]?.id;

    const { data: newPin, error: pinErr } = await supabase.from("pins").insert({
      org_id: org.id,
      board_id: boardId,
      title: pinData.title,
      description: pinData.description,
      alt_text: pinData.alt_text || pinData.title,
      link_url: pinData.link_url || null,
      keywords: pinData.keywords || [],
      pin_type: pinData.video_url ? "video" : "static",
      image_url: pinData.image_url || null,
      video_url: pinData.video_url || null,
      status: "generated",
    }).select("id, title").single();

    return NextResponse.json({
      success: !pinErr,
      step: "create-pin",
      pin: newPin,
      error: pinErr?.message,
    });
  }

  // ─── DISTRIBUTE PINS: Spread pins evenly across all boards ───
  if (step === "distribute-pins") {
    const { data: allPins } = await supabase
      .from("pins")
      .select("id, board_id")
      .eq("org_id", org.id)
      .in("status", ["generated", "approved", "scheduled"])
      .order("created_at", { ascending: true });

    const { data: allBoards } = await supabase
      .from("boards")
      .select("id, name")
      .eq("org_id", org.id)
      .eq("status", "active");

    if (!allPins?.length || !allBoards?.length) {
      return NextResponse.json({ success: true, step: "distribute-pins", message: "No pins or boards" });
    }

    // Round-robin assign pins to boards
    let updated = 0;
    for (let i = 0; i < allPins.length; i++) {
      const targetBoard = allBoards[i % allBoards.length];
      await supabase.from("pins").update({ board_id: targetBoard.id }).eq("id", allPins[i].id);
      updated++;
    }

    // Count per board
    const distribution: Record<string, number> = {};
    for (let i = 0; i < allPins.length; i++) {
      const boardName = allBoards[i % allBoards.length].name;
      distribution[boardName] = (distribution[boardName] || 0) + 1;
    }

    return NextResponse.json({ success: true, step: "distribute-pins", updated, distribution });
  }

  // ─── UPDATE PIN LINKS: Set link_url on all pins ───
  if (step === "update-links") {
    const { link_url } = body;
    if (!link_url) return NextResponse.json({ error: "link_url required" }, { status: 400 });

    const { data: updated, error: updateErr } = await supabase
      .from("pins")
      .update({ link_url, updated_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .in("status", ["generated", "approved", "scheduled"])
      .select("id");

    // Also save as default link + optional logo in brand profile
    const { data: bp } = await supabase.from("brand_profiles").select("raw_data").eq("org_id", org.id).single();
    const rawData = (bp?.raw_data || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { ...rawData, default_link_url: link_url };
    if (body.logo_url) updates.logo_url = body.logo_url;
    await supabase.from("brand_profiles").update({
      raw_data: updates,
    }).eq("org_id", org.id);

    return NextResponse.json({
      success: !updateErr,
      step: "update-links",
      updated: updated?.length || 0,
      link_url,
      error: updateErr?.message,
    });
  }

  // ─── SCHEDULE PINS: Spread approved pins across days, mix video/static ───
  if (step === "schedule-pins") {
    const pinsPerDay = body.pins_per_day || 1;
    const instantPost = body.instant_post || 0; // Number of pins to post immediately

    const { data: approvedPins } = await supabase
      .from("pins")
      .select("id, title, pin_type, video_url, image_url")
      .eq("org_id", org.id)
      .eq("status", "approved")
      .order("created_at", { ascending: true });

    // Sort to alternate video/static for variety
    if (approvedPins && approvedPins.length > 1) {
      const videos = approvedPins.filter((p) => p.pin_type === "video" || p.video_url);
      const statics = approvedPins.filter((p) => p.pin_type !== "video" && !p.video_url);
      const mixed: typeof approvedPins = [];
      let vi = 0, si = 0;
      let lastType = "";
      while (vi < videos.length || si < statics.length) {
        // Alternate: if last was video, pick static next (and vice versa)
        if (lastType !== "static" && si < statics.length) {
          mixed.push(statics[si++]);
          lastType = "static";
        } else if (lastType !== "video" && vi < videos.length) {
          mixed.push(videos[vi++]);
          lastType = "video";
        } else if (si < statics.length) {
          mixed.push(statics[si++]);
          lastType = "static";
        } else if (vi < videos.length) {
          mixed.push(videos[vi++]);
          lastType = "video";
        }
      }
      approvedPins.splice(0, approvedPins.length, ...mixed);
    }

    if (!approvedPins?.length) {
      return NextResponse.json({ success: true, step: "schedule-pins", scheduled: 0, message: "No approved pins to schedule" });
    }

    const timezone = org.settings?.timezone || "Europe/Amsterdam";
    const postingHours = org.settings?.posting_hours || [18, 19, 20, 21];
    let scheduled = 0;
    const calErrors: string[] = [];

    for (let i = 0; i < approvedPins.length; i++) {
      const pin = approvedPins[i];
      // With pinsPerDay=2: pin 0,1 → day 1, pin 2,3 → day 2, etc.
      // First `instantPost` pins go to today (immediate)
      const daysFromNow = i < instantPost ? 0 : Math.floor((i - instantPost) / pinsPerDay) + 1;
      const slotInDay = i < instantPost ? i : (i - instantPost) % pinsPerDay;
      const hour = postingHours[slotInDay % postingHours.length];
      const minute = (i * 7 + 13) % 60;

      const scheduleDate = new Date();
      scheduleDate.setDate(scheduleDate.getDate() + daysFromNow);
      scheduleDate.setHours(hour - 2, minute, 0, 0); // Rough CEST offset

      const scheduledDate = scheduleDate.toISOString().split("T")[0];
      const scheduledTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

      // Update pin status to scheduled + set scheduled_at
      const { error: pinErr } = await supabase
        .from("pins")
        .update({
          status: "scheduled",
          scheduled_at: scheduleDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pin.id);

      if (pinErr) {
        calErrors.push(`Pin ${pin.id}: ${pinErr.message}`);
        continue;
      }

      // Create calendar entry so it shows in the calendar view
      await supabase.from("calendar_entries").delete().eq("pin_id", pin.id);
      const { error: calErr } = await supabase.from("calendar_entries").insert({
        org_id: org.id,
        pin_id: pin.id,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        slot_index: i,
      });
      if (calErr) calErrors.push(`Calendar ${pin.id}: ${calErr.message}`);

      scheduled++;
    }

    return NextResponse.json({
      success: true,
      step: "schedule-pins",
      scheduled,
      calendar_errors: calErrors,
      pins: approvedPins.map((p, i) => ({
        id: p.id,
        title: p.title?.substring(0, 50),
        day: i + 1,
      })),
    });
  }

  // ─── TEST TRANSCRIBE: Debug Deepgram transcription ───
  if (step === "test-transcribe") {
    const { video_path } = body;
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) return NextResponse.json({ error: "No DEEPGRAM_API_KEY" });

    const results: Record<string, unknown> = { deepgram_key: deepgramKey.substring(0, 8) + "..." };

    try {
      // Step 1: List files in creatives folder
      const { data: files } = await supabase.storage
        .from("pin-images")
        .list(`${org.id}/creatives`, { limit: 10 });
      results.files = files?.map(f => f.name) || [];

      // Step 2: Pick the first video file or use provided path
      const videoFile = video_path || (files?.find(f => /\.(mp4|mov|webm)/i.test(f.name))?.name);
      if (!videoFile) return NextResponse.json({ ...results, error: "No video files found" });
      results.video_file = videoFile;

      const storagePath = `${org.id}/creatives/${videoFile}`;

      // Step 3: Create signed URL
      const { data: signedData, error: signErr } = await supabase.storage
        .from("pin-images")
        .createSignedUrl(storagePath, 300);
      results.signed_url = signedData?.signedUrl?.substring(0, 100) || null;
      results.sign_error = signErr?.message || null;

      if (signedData?.signedUrl) {
        // Step 4: Test if signed URL is accessible
        const testRes = await fetch(signedData.signedUrl, { method: "HEAD" });
        results.signed_url_status = testRes.status;
        results.signed_url_content_type = testRes.headers.get("content-type");
        results.signed_url_size = testRes.headers.get("content-length");

        // Step 5: Send to Deepgram
        const { DeepgramClient } = await import("@/lib/deepgram/client");
        const deepgram = new DeepgramClient(deepgramKey);
        const transcript = await deepgram.transcribe(signedData.signedUrl);
        results.transcript = transcript.substring(0, 500);
        results.transcript_length = transcript.length;
      }
    } catch (err) {
      results.error = err instanceof Error ? err.message : String(err);
      results.stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined;
    }

    return NextResponse.json({ success: true, step: "test-transcribe", ...results });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}

function groupByStatus(pins: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pin of pins) {
    counts[pin.status] = (counts[pin.status] || 0) + 1;
  }
  return counts;
}
