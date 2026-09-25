-- 110: RLS-helpers één keer per query, niet één keer per rij
--
-- Aanleiding (25-09-2026): Zones gaf "canceling statement due to statement
-- timeout". De read op pinterest_metrics_snapshots duurde 1,84s voor 4.000
-- rijen, waarvan 1,75s in de RLS-filter: is_agency_admin() en user_org_id()
-- werden PER RIJ uitgevoerd (elk een lookup in users). Zones leest vier van
-- zulke pagina's en de hub draait nog vier berekeningen tegelijk; samen met de
-- schrijflast van de snapshot-crons ging dat over de 8s van 'authenticated'.
--
-- In (SELECT f()) wordt de aanroep een initPlan: één keer per statement
-- uitgerekend. Dit is de aanpak die Supabase zelf voorschrijft en verandert
-- niets aan wie wat mag zien. Gegenereerd uit pg_policies; alle 71
-- policies die een van de twee helpers gebruiken. Een nieuwe policy schrijf
-- je voortaan meteen zo.

BEGIN;

ALTER POLICY "Agency admins can view all account analytics" ON public.account_analytics
  USING ((SELECT is_agency_admin()));

ALTER POLICY "Agency admins can view all account_analytics" ON public.account_analytics
  USING ((SELECT is_agency_admin()));

ALTER POLICY "Users can view own org account analytics" ON public.account_analytics
  USING ((org_id = (SELECT user_org_id())));

ALTER POLICY "Users can view own org account_analytics" ON public.account_analytics
  USING ((org_id = (SELECT user_org_id())));

ALTER POLICY org_isolation ON public.ai_tasks
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.ai_tasks
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.ai_tasks
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.board_analytics
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.board_analytics
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.board_sections
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.board_sections
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.boards
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.boards
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.boards
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.boards
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.brand_documents
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.brand_documents
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.brand_documents
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.brand_documents
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.brand_profiles
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.brand_profiles
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.brand_profiles
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.brand_profiles
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.calendar_entries
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.calendar_entries
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.calendar_entries
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.calendar_entries
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY "Agency admins can delete documents" ON public.client_documents
  USING ((SELECT is_agency_admin()));

ALTER POLICY "Users can insert own org documents" ON public.client_documents
  WITH CHECK (((org_id IN ( SELECT users.org_id
   FROM users
  WHERE (users.id = auth.uid()))) OR (SELECT is_agency_admin())));

ALTER POLICY "Users can view own org documents" ON public.client_documents
  USING (((org_id IN ( SELECT users.org_id
   FROM users
  WHERE (users.id = auth.uid()))) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.competitor_boards
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.competitor_boards
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.competitors
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.competitors
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.competitors
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.competitors
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY content_sources_delete ON public.content_sources
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY content_sources_insert ON public.content_sources
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY content_sources_select ON public.content_sources
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY content_sources_update ON public.content_sources
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())))
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY agency_manages_rules ON public.feedback_rules
  USING ((SELECT is_agency_admin()));

ALTER POLICY read_rules ON public.feedback_rules
  USING (((org_id IS NULL) OR (org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.keywords
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.keywords
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.keywords
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.keywords
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_upload ON storage.objects
  WITH CHECK (((bucket_id = 'uploads'::text) AND ((storage.foldername(name))[2] = ((SELECT user_org_id()))::text)));

ALTER POLICY "Agency admin manages all orgs" ON public.organizations
  USING ((SELECT is_agency_admin()));

ALTER POLICY "Client admin updates own org" ON public.organizations
  USING (((id = (SELECT user_org_id())) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['agency_admin'::user_role, 'client_admin'::user_role])))))));

ALTER POLICY "Users see own org" ON public.organizations
  USING (((id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY agency_manages_patterns ON public.performance_patterns
  USING ((SELECT is_agency_admin()));

ALTER POLICY org_isolation ON public.pin_analytics
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.pin_analytics
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.pin_analytics
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.pins
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.pins
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.pins
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.pins
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY agency_manages_all ON public.pinterest_metrics_snapshots
  USING ((SELECT is_agency_admin()));

ALTER POLICY org_isolation ON public.pinterest_metrics_snapshots
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_delete ON public.products
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_isolation ON public.products
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_update ON public.products
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY org_write ON public.products
  WITH CHECK (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY "Agency admins can insert sales data" ON public.sales_data
  WITH CHECK (((SELECT is_agency_admin()) OR (org_id = (SELECT user_org_id()))));

ALTER POLICY "Agency admins can update sales data" ON public.sales_data
  USING (((SELECT is_agency_admin()) OR (org_id = (SELECT user_org_id()))));

ALTER POLICY "Users can view own org sales data" ON public.sales_data
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY agency_manages_all ON public.store_settings
  USING ((SELECT is_agency_admin()));

ALTER POLICY org_isolation ON public.store_settings
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

ALTER POLICY "Agency admin manages all users" ON public.users
  USING ((SELECT is_agency_admin()));

ALTER POLICY "Users see own org members" ON public.users
  USING (((org_id = (SELECT user_org_id())) OR (SELECT is_agency_admin())));

COMMIT;
