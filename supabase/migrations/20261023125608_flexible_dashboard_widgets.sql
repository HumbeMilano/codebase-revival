BEGIN;

-- Preferences contain widget IDs and sizes only, never household records.
CREATE OR REPLACE FUNCTION public.valid_dashboard_layout(_layout jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE widget jsonb; seen text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(_layout) IS DISTINCT FROM 'object'
     OR _layout->'version' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(_layout->'widgets') IS DISTINCT FROM 'array'
     OR _layout - 'version' - 'widgets' <> '{}'::jsonb THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(_layout->'widgets') > 12 THEN RETURN false; END IF;
  FOR widget IN SELECT value FROM jsonb_array_elements(_layout->'widgets') LOOP
    IF jsonb_typeof(widget) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT coalesce(widget->>'id' IN ('tasks','shopping','calendar','notes','family','finance','clock','my-tasks','week','pinned-note','progress','quick-add'),false)
       OR NOT coalesce(widget->>'size' IN ('compact','wide','large'),false)
       OR widget - 'id' - 'size' <> '{}'::jsonb
       OR widget->>'id' = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen,widget->>'id');
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_dashboard_layout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_dashboard_layout(jsonb) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
