BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
 AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shopping_lists') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
 END IF;
END $$;
-- Public catalogue follows the editable operating country without exposing
-- support contacts, legal settings, payment records or administrator identity.
CREATE OR REPLACE FUNCTION public.business_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('provider','stripe','country',coalesce((SELECT country FROM homehub_private.business_settings WHERE id),'US'),'automatic_billing',false,
 'plans',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'amount_cents',amount_cents,'annual_amount_cents',annual_amount_cents,'currency',currency) ORDER BY id) FROM homehub_private.business_plans))
$$;
REVOKE ALL ON FUNCTION public.business_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_catalog() TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
