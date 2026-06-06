-- Add a restricted "store_owner" role. Store owners get a connect-only login:
-- they can see a limited set of pages (Overview, Calendar, Integrations) so they
-- can connect their own Shopify store via OAuth, without access to the rest of
-- the agency dashboard.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction with other
-- statements that use the new value, so keep this migration to just this line.
alter type user_role add value if not exists 'store_owner';
