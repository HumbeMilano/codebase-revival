BEGIN;
CREATE OR REPLACE FUNCTION public.valid_dashboard_layout(_layout jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE widget jsonb; seen text[]:=ARRAY[]::text[]; identity text; version integer;
BEGIN
 IF jsonb_typeof(_layout) IS DISTINCT FROM 'object' OR _layout->'version' NOT IN('1'::jsonb,'2'::jsonb) OR NOT (_layout ? 'version')
 OR jsonb_typeof(_layout->'widgets') IS DISTINCT FROM 'array' OR _layout-'version'-'widgets'<>'{}'::jsonb THEN RETURN false; END IF;
 version:=(_layout->>'version')::integer;
 IF jsonb_array_length(_layout->'widgets')>(CASE WHEN version=1 THEN 12 ELSE 36 END) THEN RETURN false; END IF;
 FOR widget IN SELECT value FROM jsonb_array_elements(_layout->'widgets') LOOP
  IF jsonb_typeof(widget) IS DISTINCT FROM 'object' OR NOT coalesce(widget->>'id' IN('tasks','shopping','calendar','notes','family','finance','clock','my-tasks','week','pinned-note','progress','quick-add','member-summary','month-calendar','bills','specific-note'),false) THEN RETURN false; END IF;
  IF version=1 THEN
   IF widget->>'id' IN('member-summary','month-calendar','bills','specific-note') OR NOT coalesce(widget->>'size' IN('compact','wide','large'),false) OR widget-'id'-'size'<>'{}'::jsonb THEN RETURN false; END IF;
   identity:=widget->>'id';
  ELSE
   IF jsonb_typeof(widget->'key') IS DISTINCT FROM 'string' OR widget->>'key' !~ '^[A-Za-z0-9_-]{1,100}$'
   OR NOT coalesce(widget->>'size' IN('small','compact','tall','column','short','wide','square','portrait','banner','panorama','large','full'),false)
   OR widget-'id'-'size'-'key'-'memberId'-'noteId'<>'{}'::jsonb THEN RETURN false; END IF;
   IF widget ? 'memberId' AND (widget->>'id'<>'member-summary' OR jsonb_typeof(widget->'memberId') IS DISTINCT FROM 'string' OR widget->>'memberId' !~ '^[A-Za-z0-9_-]{1,100}$') THEN RETURN false; END IF;
   IF widget ? 'noteId' AND (widget->>'id'<>'specific-note' OR jsonb_typeof(widget->'noteId') IS DISTINCT FROM 'string' OR widget->>'noteId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') THEN RETURN false; END IF;
   identity:=widget->>'key';
  END IF;
  IF identity=ANY(seen) THEN RETURN false; END IF;
  seen:=array_append(seen,identity);
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_dashboard_layout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_dashboard_layout(jsonb) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
