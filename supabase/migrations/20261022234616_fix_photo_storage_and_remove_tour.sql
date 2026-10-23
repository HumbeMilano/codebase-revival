BEGIN;

-- household_accounts deliberately has no client SELECT policy. Consulting it
-- directly inside a storage policy therefore denied legitimate adult uploads.
-- The existing helper verifies auth.uid(), current membership, role and suspension
-- against the protected tables. CASE keeps malformed folder names from UUID casts.
ALTER POLICY household_photo_upload ON storage.objects TO authenticated
WITH CHECK (
 bucket_id='household-photos' AND
 CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN public.is_household_admin(((storage.foldername(name))[1])::uuid)
 ELSE false END
);
ALTER POLICY household_photo_delete ON storage.objects TO authenticated
USING (
 bucket_id='household-photos' AND
 CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN public.is_household_admin(((storage.foldername(name))[1])::uuid)
 ELSE false END
);

-- A lost response may already have committed the metadata. Retrying its private,
-- unique object path must return the same receipt, including at the 12-photo cap.
CREATE OR REPLACE FUNCTION public.add_household_photo(_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; result uuid;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF _path IS NULL OR _path NOT LIKE hid::text||'/%' OR length(_path)>=200 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='household-photos' AND name=_path) THEN RAISE EXCEPTION 'Upload a household photo first' USING ERRCODE='22023'; END IF;
 SELECT id INTO result FROM public.household_photos WHERE household_id=hid AND path=_path;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF(SELECT count(*) FROM public.household_photos WHERE household_id=hid)>=12 THEN RAISE EXCEPTION 'At most 12 household photos' USING ERRCODE='22023'; END IF;
 INSERT INTO public.household_photos(household_id,path,position) VALUES(hid,_path,coalesce((SELECT max(position)+1 FROM public.household_photos WHERE household_id=hid),0)) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.add_household_photo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_household_photo(text) TO authenticated;

-- The owner requested removal of the tour, including its saved preferences.
DROP FUNCTION public.save_onboarding_progress(text[],boolean,boolean);
ALTER TABLE public.profiles DROP COLUMN onboarding_state;
NOTIFY pgrst,'reload schema';
COMMIT;
