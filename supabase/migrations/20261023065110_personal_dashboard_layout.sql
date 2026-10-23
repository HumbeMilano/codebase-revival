BEGIN;

-- Preferences contain widget IDs and sizes only, never household records.
CREATE FUNCTION public.valid_dashboard_layout(_layout jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE widget jsonb; seen text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(_layout) IS DISTINCT FROM 'object'
     OR _layout->'version' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(_layout->'widgets') IS DISTINCT FROM 'array'
     OR _layout - 'version' - 'widgets' <> '{}'::jsonb THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(_layout->'widgets') > 6 THEN RETURN false; END IF;
  FOR widget IN SELECT value FROM jsonb_array_elements(_layout->'widgets') LOOP
    IF jsonb_typeof(widget) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT coalesce(widget->>'id' IN ('tasks','shopping','calendar','notes','family','finance'),false)
       OR NOT coalesce(widget->>'size' IN ('compact','wide'),false)
       OR widget - 'id' - 'size' <> '{}'::jsonb
       OR widget->>'id' = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen,widget->>'id');
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_dashboard_layout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_dashboard_layout(jsonb) TO authenticated,service_role;

CREATE TABLE public.dashboard_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  layout jsonb NOT NULL CHECK (public.valid_dashboard_layout(layout)),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.dashboard_preferences TO authenticated;
GRANT ALL ON public.dashboard_preferences TO service_role;
CREATE POLICY dashboard_preferences_read ON public.dashboard_preferences
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY dashboard_preferences_create ON public.dashboard_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY dashboard_preferences_update ON public.dashboard_preferences
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No definer privilege is needed: every operation uses the caller's own RLS row.
-- Revision checks avoid overwriting another tab/device. Repeating an uncertain
-- successful request returns the same receipt rather than incrementing twice.
CREATE FUNCTION public.save_dashboard_layout(_layout jsonb,_expected_revision integer)
RETURNS SETOF public.dashboard_preferences
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE account_id uuid := auth.uid(); saved public.dashboard_preferences%ROWTYPE;
BEGIN
  IF account_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF _expected_revision IS NULL OR _expected_revision < 0
     OR NOT public.valid_dashboard_layout(_layout) THEN
    RAISE EXCEPTION 'Invalid dashboard layout' USING ERRCODE='22023';
  END IF;
  IF _expected_revision = 0 THEN
    INSERT INTO public.dashboard_preferences(user_id,layout)
      VALUES(account_id,_layout) ON CONFLICT (user_id) DO NOTHING RETURNING * INTO saved;
  ELSE
    UPDATE public.dashboard_preferences AS preferences
      SET layout=_layout,revision=preferences.revision+1,updated_at=now()
      WHERE preferences.user_id=account_id AND preferences.revision=_expected_revision
      RETURNING preferences.* INTO saved;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO saved FROM public.dashboard_preferences AS preferences
      WHERE preferences.user_id=account_id
        AND preferences.revision::bigint=_expected_revision::bigint+1
        AND preferences.layout=_layout;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dashboard changed on another device' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN NEXT saved;
END $$;
REVOKE ALL ON FUNCTION public.save_dashboard_layout(jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_dashboard_layout(jsonb,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
