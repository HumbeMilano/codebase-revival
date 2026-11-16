BEGIN;

-- Shared household cookbook. A paired tablet can read it before PIN entry;
-- creation, editing, archiving and uploads require an adult personal account.
CREATE FUNCTION homehub_private.valid_recipe_content(v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i jsonb; k text;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT (v ?& ARRAY['version','name','description','servings','prep_minutes','cook_minutes','ingredients','steps','nutrition','source']) THEN RETURN false; END IF;
 FOR k IN SELECT jsonb_object_keys(v) LOOP
  IF k NOT IN ('version','name','description','servings','prep_minutes','cook_minutes','ingredients','steps','nutrition','source') THEN RETURN false; END IF;
 END LOOP;
 IF v->'version' <> '1'::jsonb OR jsonb_typeof(v->'name') <> 'string' OR length(btrim(v->>'name')) NOT BETWEEN 1 AND 150 OR jsonb_typeof(v->'description') <> 'string' OR length(v->>'description')>2000 OR jsonb_typeof(v->'source') <> 'string' OR length(v->>'source')>500 THEN RETURN false; END IF;
 IF jsonb_typeof(v->'servings') <> 'number' THEN RETURN false; END IF;
 IF (v->>'servings')::numeric NOT BETWEEN 1 AND 1000 OR trunc((v->>'servings')::numeric)<>(v->>'servings')::numeric THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['prep_minutes','cook_minutes'] LOOP
  IF v->k <> 'null'::jsonb THEN
   IF jsonb_typeof(v->k) <> 'number' THEN RETURN false; END IF;
   IF (v->>k)::numeric NOT BETWEEN 0 AND 10080 OR trunc((v->>k)::numeric)<>(v->>k)::numeric THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF jsonb_typeof(v->'ingredients') <> 'array' OR jsonb_typeof(v->'steps') <> 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(v->'ingredients') NOT BETWEEN 1 AND 100 OR jsonb_array_length(v->'steps') NOT BETWEEN 1 AND 60 THEN RETURN false; END IF;
 FOR i IN SELECT jsonb_array_elements(v->'ingredients') LOOP
  IF jsonb_typeof(i) <> 'object' OR NOT (i ?& ARRAY['name','quantity','unit']) THEN RETURN false; END IF;
  FOR k IN SELECT jsonb_object_keys(i) LOOP IF k NOT IN ('name','quantity','unit') THEN RETURN false; END IF; END LOOP;
  IF jsonb_typeof(i->'name') <> 'string' OR length(btrim(i->>'name')) NOT BETWEEN 1 AND 200 OR jsonb_typeof(i->'quantity') <> 'string' OR length(i->>'quantity')>80 OR jsonb_typeof(i->'unit') <> 'string' OR length(i->>'unit')>40 THEN RETURN false; END IF;
 END LOOP;
 FOR i IN SELECT jsonb_array_elements(v->'steps') LOOP
  IF jsonb_typeof(i) <> 'string' OR length(btrim(i #>> '{}')) NOT BETWEEN 1 AND 3000 THEN RETURN false; END IF;
 END LOOP;
 i:=v->'nutrition';
 IF jsonb_typeof(i) <> 'object' OR NOT (i ?& ARRAY['calories_kcal','protein_g']) THEN RETURN false; END IF;
 FOR k IN SELECT jsonb_object_keys(i) LOOP IF k NOT IN ('calories_kcal','protein_g') THEN RETURN false; END IF; END LOOP;
 FOREACH k IN ARRAY ARRAY['calories_kcal','protein_g'] LOOP
  IF i->k <> 'null'::jsonb THEN
   IF jsonb_typeof(i->k) <> 'number' THEN RETURN false; END IF;
   IF (i->>k)::numeric < 0 OR (i->>k)::numeric > (CASE WHEN k='protein_g' THEN 10000 ELSE 100000 END) THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION homehub_private.valid_recipe_content(jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.recipes (
 id uuid PRIMARY KEY,
 household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
 content jsonb NOT NULL CHECK (homehub_private.valid_recipe_content(content)),
 archived boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,household_id)
);
CREATE INDEX recipes_household_idx ON public.recipes(household_id,archived,updated_at DESC);
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.recipes TO anon,authenticated;
CREATE POLICY recipes_read ON public.recipes FOR SELECT TO anon,authenticated
USING (household_id IN (SELECT public.current_household_ids()) AND (NOT archived OR public.is_household_admin(household_id)));

CREATE FUNCTION public.save_recipe(_id uuid,_expected_revision bigint,_content jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; previous public.recipes; result public.recipes;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF _id IS NULL OR _expected_revision IS NULL OR _expected_revision<0 OR NOT coalesce(homehub_private.valid_recipe_content(_content),false) THEN RAISE EXCEPTION 'Invalid recipe content' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.recipes WHERE id=_id;
 IF FOUND THEN
  IF previous.household_id<>hid THEN RAISE EXCEPTION 'Recipe access denied' USING ERRCODE='42501'; END IF;
  IF previous.archived THEN RAISE EXCEPTION 'Restore the recipe first' USING ERRCODE='22023'; END IF;
  -- A response may be lost after the original write committed. Reusing its ID
  -- and exact content is safe and must not create another version or recipe.
  IF previous.content=_content THEN RETURN to_jsonb(previous); END IF;
  IF previous.revision<>_expected_revision THEN RAISE EXCEPTION 'Recipe changed' USING ERRCODE='40001'; END IF;
  UPDATE public.recipes SET content=_content,revision=revision+1,updated_at=now() WHERE id=_id RETURNING * INTO result;
 ELSE
  IF _expected_revision<>0 THEN RAISE EXCEPTION 'Recipe changed' USING ERRCODE='40001'; END IF;
  IF (SELECT count(*) FROM public.recipes WHERE household_id=hid)>=200 THEN RAISE EXCEPTION 'Recipe capacity reached' USING ERRCODE='54000'; END IF;
  INSERT INTO public.recipes(id,household_id,content) VALUES(_id,hid,_content) RETURNING * INTO result;
 END IF;
 RETURN to_jsonb(result);
END $$;
CREATE FUNCTION public.archive_recipe(_id uuid,_expected_revision bigint,_archived boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; result public.recipes;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 SELECT * INTO result FROM public.recipes WHERE id=_id AND household_id=hid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipe access denied' USING ERRCODE='42501'; END IF;
 IF _archived IS NULL OR _expected_revision IS NULL THEN RAISE EXCEPTION 'Invalid recipe change' USING ERRCODE='22023'; END IF;
 IF result.archived=_archived THEN RETURN to_jsonb(result); END IF;
 IF result.revision<>_expected_revision THEN RAISE EXCEPTION 'Recipe changed' USING ERRCODE='40001'; END IF;
 UPDATE public.recipes SET archived=_archived,revision=revision+1,updated_at=now() WHERE id=_id RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.save_recipe(uuid,bigint,jsonb),public.archive_recipe(uuid,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_recipe(uuid,bigint,jsonb),public.archive_recipe(uuid,bigint,boolean) TO authenticated;

CREATE TABLE public.recipe_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipe_id uuid NOT NULL,
 household_id uuid NOT NULL,
 path text NOT NULL UNIQUE CHECK(length(path)<200),
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(recipe_id,household_id) REFERENCES public.recipes(id,household_id) ON DELETE CASCADE
);
CREATE INDEX recipe_photos_recipe_idx ON public.recipe_photos(recipe_id,household_id,position);
ALTER TABLE public.recipe_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipe_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.recipe_photos TO anon,authenticated;
CREATE POLICY recipe_photos_read ON public.recipe_photos FOR SELECT TO anon,authenticated
USING (household_id IN (SELECT public.current_household_ids()) AND EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_id AND r.household_id=recipe_photos.household_id));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('recipe-photos','recipe-photos',false,2097152,ARRAY['image/jpeg','image/png','image/webp']);
CREATE FUNCTION public.can_manage_recipe_photo(_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN _path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'
 THEN EXISTS(SELECT 1 FROM public.recipes r WHERE r.household_id::text=split_part(_path,'/',1) AND r.id::text=split_part(_path,'/',2) AND public.is_household_admin(r.household_id))
 ELSE false END
$$;
REVOKE ALL ON FUNCTION public.can_manage_recipe_photo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_recipe_photo(text) TO authenticated;
CREATE POLICY recipe_photo_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='recipe-photos' AND public.can_manage_recipe_photo(name));
CREATE POLICY recipe_photo_adult_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='recipe-photos' AND public.can_manage_recipe_photo(name));
CREATE POLICY recipe_photo_delete ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='recipe-photos' AND public.can_manage_recipe_photo(name));

CREATE FUNCTION public.add_recipe_photo(_recipe_id uuid,_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; result uuid;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF NOT EXISTS(SELECT 1 FROM public.recipes WHERE id=_recipe_id AND household_id=hid AND NOT archived) THEN RAISE EXCEPTION 'Recipe access denied' USING ERRCODE='42501'; END IF;
 IF _path IS NULL OR split_part(_path,'/',2)<>_recipe_id::text OR NOT public.can_manage_recipe_photo(_path) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='recipe-photos' AND name=_path) THEN RAISE EXCEPTION 'Upload the recipe photo first' USING ERRCODE='22023'; END IF;
 SELECT id INTO result FROM public.recipe_photos WHERE recipe_id=_recipe_id AND path=_path;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF (SELECT count(*) FROM public.recipe_photos WHERE recipe_id=_recipe_id)>=4 THEN RAISE EXCEPTION 'At most 4 recipe photos' USING ERRCODE='54000'; END IF;
 INSERT INTO public.recipe_photos(recipe_id,household_id,path,position)
 VALUES(_recipe_id,hid,_path,coalesce((SELECT max(position)+1 FROM public.recipe_photos WHERE recipe_id=_recipe_id),0)) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.remove_recipe_photo(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF EXISTS(SELECT 1 FROM public.recipe_photos WHERE id=_id AND household_id<>hid) THEN RAISE EXCEPTION 'Photo access denied' USING ERRCODE='42501'; END IF;
 DELETE FROM public.recipe_photos WHERE id=_id AND household_id=hid;
END $$;
REVOKE ALL ON FUNCTION public.add_recipe_photo(uuid,text),public.remove_recipe_photo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_recipe_photo(uuid,text),public.remove_recipe_photo(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
