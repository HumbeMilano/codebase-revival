CREATE TYPE public.app_role AS ENUM ('platform_admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

ALTER TABLE public.households ADD COLUMN plan text NOT NULL DEFAULT 'free';
ALTER TABLE public.households ADD COLUMN suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_household_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ids.household_id FROM (
    SELECT household_id FROM public.household_accounts WHERE user_id = auth.uid()
    UNION
    SELECT household_id FROM public.devices
    WHERE NOT revoked
      AND token_hash = encode(extensions.digest(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-device-token', ''), 'sha256'), 'hex')
      AND coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-device-token', '') <> ''
  ) ids JOIN public.households h ON h.id = ids.household_id
  WHERE NOT h.suspended
$$;

CREATE OR REPLACE FUNCTION public.am_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'platform_admin')
$$;
GRANT EXECUTE ON FUNCTION public.am_platform_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_platform_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  LOCK TABLE public.user_roles IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'platform_admin') THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'platform_admin');
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_platform_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_admin_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'platform_admin')
$$;
GRANT EXECUTE ON FUNCTION public.platform_admin_exists() TO authenticated;

CREATE OR REPLACE FUNCTION public.require_platform_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.am_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE(households bigint, suspended bigint, pro bigint, accounts bigint, members bigint, devices bigint, new_households_30d bigint, new_accounts_30d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_platform_admin();
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.households),
    (SELECT count(*) FROM public.households WHERE households.suspended),
    (SELECT count(*) FROM public.households WHERE plan = 'pro'),
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.members),
    (SELECT count(*) FROM public.devices WHERE NOT revoked),
    (SELECT count(*) FROM public.households WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '30 days');
END $$;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_households()
RETURNS TABLE(id uuid, name text, plan text, suspended boolean, created_at timestamptz, members bigint, accounts bigint, devices bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_platform_admin();
  RETURN QUERY SELECT h.id, h.name, h.plan, h.suspended, h.created_at,
    (SELECT count(*) FROM public.members m WHERE m.household_id = h.id),
    (SELECT count(*) FROM public.household_accounts a WHERE a.household_id = h.id),
    (SELECT count(*) FROM public.devices d WHERE d.household_id = h.id AND NOT d.revoked)
  FROM public.households h ORDER BY h.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_households() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_accounts()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean, household_name text, is_admin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_platform_admin();
  RETURN QUERY SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at IS NOT NULL,
    (SELECT h.name FROM public.household_accounts a JOIN public.households h ON h.id = a.household_id WHERE a.user_id = u.id LIMIT 1),
    public.has_role(u.id, 'platform_admin')
  FROM auth.users u ORDER BY u.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_household(_id uuid, _plan text, _suspended boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_platform_admin();
  IF _plan NOT IN ('free', 'pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  UPDATE public.households SET plan = _plan, suspended = _suspended WHERE id = _id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_household(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_household_devices(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_platform_admin();
  UPDATE public.devices SET revoked = true WHERE household_id = _id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_revoke_household_devices(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_platform_admin(_user uuid, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_platform_admin();
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user, 'platform_admin') ON CONFLICT DO NOTHING;
  ELSE
    IF _user = auth.uid() THEN RAISE EXCEPTION 'Cannot remove yourself'; END IF;
    DELETE FROM public.user_roles WHERE user_id = _user AND role = 'platform_admin';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_admin(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.require_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_stats(), public.admin_list_households(), public.admin_list_accounts(), public.admin_set_household(uuid, text, boolean), public.admin_revoke_household_devices(uuid), public.admin_set_platform_admin(uuid, boolean), public.claim_platform_admin(), public.platform_admin_exists(), public.am_platform_admin() FROM PUBLIC, anon;