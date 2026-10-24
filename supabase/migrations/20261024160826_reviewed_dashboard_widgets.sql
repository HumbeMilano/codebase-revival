-- Version 3 keeps reference IDs only and permits one widget per type.
-- Existing account rows and legacy validators remain compatible.
BEGIN;
CREATE OR REPLACE FUNCTION public.valid_dashboard_layout(_layout jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE widget jsonb; seen_keys text[]:=ARRAY[]::text[]; seen_types text[]:=ARRAY[]::text[];
 identity text; version integer; kind text;
BEGIN
 IF jsonb_typeof(_layout) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF _layout->'version' NOT IN('1'::jsonb,'2'::jsonb,'3'::jsonb) OR NOT (_layout ? 'version')
 OR jsonb_typeof(_layout->'widgets') IS DISTINCT FROM 'array'
 OR _layout-'version'-'widgets'<>'{}'::jsonb THEN RETURN false; END IF;
 version:=CASE _layout->'version' WHEN '1'::jsonb THEN 1 WHEN '2'::jsonb THEN 2 ELSE 3 END;
 IF jsonb_array_length(_layout->'widgets')>(CASE version WHEN 1 THEN 12 WHEN 2 THEN 36 ELSE 20 END) THEN RETURN false; END IF;
 FOR widget IN SELECT value FROM jsonb_array_elements(_layout->'widgets') LOOP
  IF jsonb_typeof(widget) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  kind:=widget->>'id';
  IF NOT coalesce(kind IN('tasks','shopping','calendar','notes','family','finance','clock','my-tasks','week','pinned-note','progress','quick-add','member-summary','month-calendar','bills','specific-note','member-tasks','reminders','next-bill','shopping-summary'),false) THEN RETURN false; END IF;
  IF version<3 AND kind IN('member-tasks','reminders','next-bill','shopping-summary') THEN RETURN false; END IF;
  IF version=1 THEN
   IF kind IN('member-summary','month-calendar','bills','specific-note') OR NOT coalesce(widget->>'size' IN('compact','wide','large'),false)
   OR widget-'id'-'size'<>'{}'::jsonb THEN RETURN false; END IF;
   identity:=kind;
  ELSE
   IF jsonb_typeof(widget->'key') IS DISTINCT FROM 'string' OR widget->>'key' !~ '^[A-Za-z0-9_-]{1,100}$'
   OR NOT coalesce(widget->>'size' IN('small','compact','tall','column','short','wide','square','portrait','banner','panorama','large','full'),false) THEN RETURN false; END IF;
   IF version=2 AND widget-'id'-'size'-'key'-'memberId'-'noteId'<>'{}'::jsonb THEN RETURN false; END IF;
   IF version=3 AND widget-'id'-'size'-'key'-'memberId'-'noteId'-'listId'<>'{}'::jsonb THEN RETURN false; END IF;
   IF widget ? 'memberId' AND (NOT (kind='member-summary' OR (version=3 AND kind='member-tasks')) OR jsonb_typeof(widget->'memberId') IS DISTINCT FROM 'string' OR widget->>'memberId' !~ '^[A-Za-z0-9_-]{1,100}$') THEN RETURN false; END IF;
   IF widget ? 'noteId' AND (kind<>'specific-note' OR jsonb_typeof(widget->'noteId') IS DISTINCT FROM 'string' OR widget->>'noteId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') THEN RETURN false; END IF;
   IF widget ? 'listId' AND (version<>3 OR kind<>'shopping' OR jsonb_typeof(widget->'listId') IS DISTINCT FROM 'string' OR widget->>'listId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') THEN RETURN false; END IF;
   identity:=widget->>'key';
  END IF;
  IF identity=ANY(seen_keys) OR (version=3 AND kind=ANY(seen_types)) THEN RETURN false; END IF;
  seen_keys:=array_append(seen_keys,identity); seen_types:=array_append(seen_types,kind);
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_dashboard_layout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_dashboard_layout(jsonb) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
