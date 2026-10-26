BEGIN;
-- Expose only current household avatar references, including on a paired tablet.
-- The personal profile table and Storage write policies remain owner-scoped.
CREATE FUNCTION public.household_avatar_paths()
RETURNS TABLE(member_key text,path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c LIMIT 1;
 IF hid IS NULL THEN RAISE EXCEPTION 'Household access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT DISTINCT ON(a.member_key) a.member_key,p.avatar_path
 FROM public.household_accounts a JOIN public.profiles p ON p.id=a.user_id
 JOIN public.members m ON m.household_id=a.household_id AND m.key=a.member_key
 WHERE a.household_id=hid AND p.avatar_path IS NOT NULL
   AND split_part(p.avatar_path,'/',1)=a.user_id::text
   AND p.avatar_path ~ ('^'||a.user_id::text||'/[A-Za-z0-9._-]{1,200}[.](jpe?g|png|webp)$')
 ORDER BY a.member_key,a.created_at DESC,a.user_id;
END $$;
REVOKE ALL ON FUNCTION public.household_avatar_paths() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.household_avatar_paths() TO anon,authenticated;
COMMIT;
