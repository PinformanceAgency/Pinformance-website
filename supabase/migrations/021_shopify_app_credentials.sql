-- Per-organization Shopify OAuth app credentials. Lets each store be
-- configured inside the Pinformance app (Integrations page) instead of via
-- global Vercel env vars — mirrors the per-org Pinterest app credentials.
-- The OAuth flow uses these per-org values first, falling back to the global
-- SHOPIFY_API_KEY / SHOPIFY_API_SECRET env vars if a per-org value isn't set.
alter table organizations
  add column if not exists shopify_api_key text,
  add column if not exists shopify_api_secret_encrypted text;
