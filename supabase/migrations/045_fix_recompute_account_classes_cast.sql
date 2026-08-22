-- The existing organic.recompute_account_classes() function was written as
--   set account_class = case ... then 'NEW' ... else 'ESTABLISHED' end
-- Postgres resolves that CASE as text and then fails to assign to the
-- account_class enum column with:
--   ERROR: column "account_class" is of type organic.account_class but
--          expression is of type text
--
-- Fix: cast each branch to the enum explicitly. Same logic, same behavior;
-- only the type resolution changes.

CREATE OR REPLACE FUNCTION organic.recompute_account_classes()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE organic.client_settings SET
    account_class = CASE
      WHEN account_created_date IS NULL THEN 'NEW'::organic.account_class
      WHEN account_created_date > current_date - interval '1 year' THEN 'NEW'::organic.account_class
      WHEN last_activity_date   < current_date - interval '6 months' THEN 'NEW'::organic.account_class
      ELSE 'ESTABLISHED'::organic.account_class
    END,
    spacing_hours = CASE
      WHEN account_created_date IS NULL THEN 48
      WHEN account_created_date > current_date - interval '1 year' THEN 48
      WHEN last_activity_date   < current_date - interval '6 months' THEN 48
      ELSE 24
    END,
    updated_at = now();
END;
$$;
