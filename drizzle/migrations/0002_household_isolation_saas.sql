CREATE TABLE public.household_accounts (
  user_id uuid NOT NULL,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, household_id)
);
CREATE TABLE public.invites (
  code text PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pairing_codes (
  code text PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 1,
  uses integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.household_accounts, public.invites, public.devices, public.pairing_codes TO service_role;
ALTER TABLE public.household_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX members_household_pin_unique ON public.members (household_id, pin_hash);
CREATE UNIQUE INDEX members_household_key_unique ON public.members (household_id, key);

-- Households the current caller may access: signed-in accounts, or a paired device via x-device-token header.
CREATE OR REPLACE FUNCTION public.current_household_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.household_accounts WHERE user_id = auth.uid()
  UNION
  SELECT household_id FROM public.devices
  WHERE NOT revoked
    AND token_hash = encode(extensions.digest(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-device-token', ''), 'sha256'), 'hex')
    AND coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-device-token', '') <> ''
$$;
GRANT EXECUTE ON FUNCTION public.current_household_ids() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_household_admin(_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_accounts a JOIN public.members m ON m.household_id = a.household_id AND m.key = a.member_key
    WHERE a.user_id = auth.uid() AND a.household_id = _household AND m.role = 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.is_household_admin(uuid) TO authenticated;

-- Replace open demo policies with per-household isolation
DROP POLICY "demo open households" ON public.households;
DROP POLICY "no direct member reads" ON public.members;
DROP POLICY "demo open chores" ON public.chores;
DROP POLICY "demo open shopping" ON public.shopping_items;
DROP POLICY "demo open events" ON public.events;
DROP POLICY "demo open notes" ON public.notes;
DROP POLICY "demo open bills" ON public.bills;
DROP POLICY "demo open bill_splits" ON public.bill_splits;
DROP POLICY "demo open bill_overrides" ON public.bill_overrides;
DROP POLICY "demo open contributions" ON public.contributions;
REVOKE INSERT, UPDATE, DELETE ON public.households FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.members FROM authenticated;

CREATE POLICY "own household read" ON public.households FOR SELECT TO anon, authenticated USING (id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.chores FOR ALL TO anon, authenticated USING (household_id IN (SELECT public.current_household_ids())) WITH CHECK (household_id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.shopping_items FOR ALL TO anon, authenticated USING (household_id IN (SELECT public.current_household_ids())) WITH CHECK (household_id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.events FOR ALL TO anon, authenticated USING (household_id IN (SELECT public.current_household_ids())) WITH CHECK (household_id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.notes FOR ALL TO anon, authenticated USING (household_id IN (SELECT public.current_household_ids())) WITH CHECK (household_id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.bills FOR ALL TO anon, authenticated USING (household_id IN (SELECT public.current_household_ids())) WITH CHECK (household_id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.contributions FOR ALL TO anon, authenticated USING (household_id IN (SELECT public.current_household_ids())) WITH CHECK (household_id IN (SELECT public.current_household_ids()));
CREATE POLICY "household isolation" ON public.bill_splits FOR ALL TO anon, authenticated
  USING (bill_id IN (SELECT id FROM public.bills WHERE household_id IN (SELECT public.current_household_ids())))
  WITH CHECK (bill_id IN (SELECT id FROM public.bills WHERE household_id IN (SELECT public.current_household_ids())));
CREATE POLICY "household isolation" ON public.bill_overrides FOR ALL TO anon, authenticated
  USING (bill_id IN (SELECT id FROM public.bills WHERE household_id IN (SELECT public.current_household_ids())))
  WITH CHECK (bill_id IN (SELECT id FROM public.bills WHERE household_id IN (SELECT public.current_household_ids())));

-- PIN check now scoped to the caller's household
CREATE OR REPLACE FUNCTION public.verify_pin(_pin text, _admin_only boolean DEFAULT false)
RETURNS TABLE(key text, name text, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.key, m.name, m.role FROM public.members m
  WHERE m.household_id IN (SELECT public.current_household_ids())
    AND m.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
    AND (NOT _admin_only OR m.role = 'admin')
$$;

-- Context for the current caller
CREATE OR REPLACE FUNCTION public.my_context()
RETURNS TABLE(household_id uuid, household_name text, member_key text, mode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.name, a.member_key, 'account'::text FROM public.household_accounts a JOIN public.households h ON h.id = a.household_id
  WHERE a.user_id = auth.uid()
  UNION ALL
  SELECT h.id, h.name, NULL::text, 'device'::text FROM public.households h
  WHERE auth.uid() IS NULL AND h.id IN (SELECT public.current_household_ids())
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.my_context() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.household_members()
RETURNS TABLE(key text, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.key, m.name, m.role FROM public.members m
  WHERE m.household_id = (SELECT c.household_id FROM public.my_context() c)
  ORDER BY CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END, m.name
$$;
GRANT EXECUTE ON FUNCTION public.household_members() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_household(_name text, _member_name text, _pin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid; mkey text := 'm_' || substr(md5(random()::text), 1, 8);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
  IF length(trim(_name)) = 0 OR length(trim(_member_name)) = 0 THEN RAISE EXCEPTION 'Name required'; END IF;
  INSERT INTO public.households (name) VALUES (trim(_name)) RETURNING id INTO hid;
  INSERT INTO public.members (household_id, key, name, role, pin_hash) VALUES (hid, mkey, trim(_member_name), 'admin', encode(extensions.digest(_pin, 'sha256'), 'hex'));
  INSERT INTO public.household_accounts (user_id, household_id, member_key) VALUES (auth.uid(), hid, mkey);
  RETURN hid;
END $$;
GRANT EXECUTE ON FUNCTION public.create_household(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invite(_member_name text, _role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid; c text;
BEGIN
  SELECT household_id INTO hid FROM public.my_context() WHERE mode = 'account';
  IF hid IS NULL OR NOT public.is_household_admin(hid) THEN RAISE EXCEPTION 'Only adults can invite'; END IF;
  IF _role NOT IN ('admin', 'member') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  c := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO public.invites (code, household_id, member_name, role, created_by, expires_at) VALUES (c, hid, trim(_member_name), _role, auth.uid(), now() + interval '7 days');
  RETURN c;
END $$;
GRANT EXECUTE ON FUNCTION public.create_invite(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invite(_code text, _pin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invites; mkey text := 'm_' || substr(md5(random()::text), 1, 8);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
  SELECT * INTO inv FROM public.invites WHERE code = upper(trim(_code)) AND used_at IS NULL AND expires_at > now() FOR UPDATE;
  IF inv.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;
  IF EXISTS (SELECT 1 FROM public.members WHERE household_id = inv.household_id AND pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')) THEN RAISE EXCEPTION 'PIN already in use'; END IF;
  INSERT INTO public.members (household_id, key, name, role, pin_hash) VALUES (inv.household_id, mkey, inv.member_name, inv.role, encode(extensions.digest(_pin, 'sha256'), 'hex'));
  INSERT INTO public.household_accounts (user_id, household_id, member_key) VALUES (auth.uid(), inv.household_id, mkey);
  UPDATE public.invites SET used_at = now() WHERE code = inv.code;
  RETURN inv.household_id;
END $$;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_pairing_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid; c text;
BEGIN
  SELECT household_id INTO hid FROM public.my_context() WHERE mode = 'account';
  IF hid IS NULL OR NOT public.is_household_admin(hid) THEN RAISE EXCEPTION 'Only adults can pair devices'; END IF;
  c := lpad((floor(random() * 1000000))::int::text, 6, '0');
  INSERT INTO public.pairing_codes (code, household_id, expires_at) VALUES (c, hid, now() + interval '10 minutes');
  RETURN c;
END $$;
GRANT EXECUTE ON FUNCTION public.create_pairing_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.pair_device(_code text, _name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pc public.pairing_codes; tok text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  SELECT * INTO pc FROM public.pairing_codes WHERE code = upper(trim(_code)) AND expires_at > now() AND uses < max_uses FOR UPDATE;
  IF pc.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired code'; END IF;
  UPDATE public.pairing_codes SET uses = uses + 1 WHERE code = pc.code;
  INSERT INTO public.devices (household_id, name, token_hash) VALUES (pc.household_id, coalesce(nullif(trim(_name), ''), 'Tablet'), encode(extensions.digest(tok, 'sha256'), 'hex'));
  RETURN tok;
END $$;
GRANT EXECUTE ON FUNCTION public.pair_device(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_devices()
RETURNS TABLE(id uuid, name text, created_at timestamptz, revoked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.name, d.created_at, d.revoked FROM public.devices d
  WHERE d.household_id = (SELECT c.household_id FROM public.my_context() c WHERE c.mode = 'account')
    AND public.is_household_admin(d.household_id)
  ORDER BY d.created_at DESC
$$;
GRANT EXECUTE ON FUNCTION public.list_devices() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_device(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.devices SET revoked = true WHERE id = _id AND public.is_household_admin(household_id);
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_device(uuid) TO authenticated;