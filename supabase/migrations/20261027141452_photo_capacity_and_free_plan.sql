BEGIN;
-- Change photo capacities without enabling commercial billing or other limits.
CREATE OR REPLACE FUNCTION homehub_private.valid_plan_limits(_v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; n numeric;
BEGIN
 IF jsonb_typeof(_v) IS DISTINCT FROM 'object' OR _v-ARRAY['members','lists','devices','photos','widgets']<>'{}'::jsonb THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['members','lists','devices','photos','widgets'] LOOP
  IF jsonb_typeof(_v->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(_v->>k)::numeric;
  IF n<>trunc(n) OR n<1 OR n>(CASE k WHEN 'members' THEN 50 WHEN 'lists' THEN 20 WHEN 'devices' THEN 20 WHEN 'photos' THEN 30 ELSE 64 END) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
UPDATE homehub_private.business_plans SET limits=jsonb_set(limits,'{photos}',CASE id WHEN 'free' THEN '10'::jsonb ELSE '30'::jsonb END),revision=revision+1 WHERE id IN('free','pro');

CREATE FUNCTION homehub_private.household_photo_limit(_household uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN coalesce((SELECT limits_enabled FROM homehub_private.business_rollout WHERE id),false)
 THEN least(30,(SELECT (p.limits->>'photos')::integer FROM public.households h JOIN homehub_private.business_plans p ON p.id=h.plan WHERE h.id=_household))
 ELSE 30 END
$$;
REVOKE ALL ON FUNCTION homehub_private.household_photo_limit(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.household_photo_capacity() RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 IF auth.uid() IS NULL OR hid IS NULL OR NOT public.is_household_admin(hid) THEN RAISE EXCEPTION 'Only adult accounts can manage photos' USING ERRCODE='42501'; END IF;
 RETURN homehub_private.household_photo_limit(hid);
END $$;
REVOKE ALL ON FUNCTION public.household_photo_capacity() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.household_photo_capacity() TO authenticated;

-- Keep the shared-tablet read authorization and expose the complete carousel.
CREATE OR REPLACE FUNCTION public.list_household_photos()
RETURNS TABLE(id uuid,path text,"position" integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.path,p.position FROM public.household_photos p
 JOIN public.my_context() c ON c.household_id=p.household_id ORDER BY p.position,p.created_at,p.id LIMIT 30
$$;

CREATE OR REPLACE FUNCTION public.add_household_photo(_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; result uuid; capacity integer;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF _path IS NULL OR _path NOT LIKE hid::text||'/%' OR length(_path)>=200 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='household-photos' AND name=_path) THEN RAISE EXCEPTION 'Upload a household photo first' USING ERRCODE='22023'; END IF;
 SELECT id INTO result FROM public.household_photos WHERE household_id=hid AND path=_path;
 IF result IS NOT NULL THEN RETURN result; END IF;
 capacity:=homehub_private.household_photo_limit(hid);
 IF capacity IS NULL OR (SELECT count(*) FROM public.household_photos WHERE household_id=hid)>=capacity THEN RAISE EXCEPTION 'At most % household photos',capacity USING ERRCODE='54000'; END IF;
 INSERT INTO public.household_photos(household_id,path,position) VALUES(hid,_path,coalesce((SELECT max(position)+1 FROM public.household_photos WHERE household_id=hid),0)) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.add_household_photo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_household_photo(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
