
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.verify_pin(_pin text, _admin_only boolean DEFAULT false)
RETURNS TABLE(key text, name text, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.key, m.name, m.role FROM public.members m
  WHERE m.household_id = '11111111-1111-1111-1111-111111111111'
    AND m.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
    AND (NOT _admin_only OR m.role = 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.verify_pin(text, boolean) TO anon, authenticated;

DROP POLICY "demo open members" ON public.members;
CREATE POLICY "no direct member reads" ON public.members FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.members FROM anon;
