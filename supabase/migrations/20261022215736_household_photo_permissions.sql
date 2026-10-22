BEGIN;
-- Supabase grants anon EXECUTE explicitly through platform default privileges.
-- Revoking PUBLIC alone does not remove that independent grant. Only account
-- adults manage photos; tablet access remains through the read-only list RPC.
REVOKE ALL ON FUNCTION public.add_household_photo(text),
 public.remove_household_photo(uuid),public.reorder_household_photos(uuid[])
 FROM PUBLIC,anon;
NOTIFY pgrst,'reload schema';
COMMIT;
