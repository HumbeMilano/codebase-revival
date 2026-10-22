CREATE OR REPLACE FUNCTION public.update_member(_key text, _name text DEFAULT NULL, _role text DEFAULT NULL, _pin text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ DECLARE
  hid uuid; m public.members; admins int;
BEGIN
  SELECT household_id INTO hid FROM public.my_context() WHERE mode='account';
  IF hid IS NULL OR NOT public.is_household_admin(hid) THEN RAISE EXCEPTION 'Only adults can manage members'; END IF;
  SELECT * INTO m FROM public.members WHERE household_id = hid AND key = _key FOR UPDATE;
  IF m.key IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF _name IS NOT NULL THEN
    IF length(trim(_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
    UPDATE public.members SET name = trim(_name) WHERE id = m.id;
  END IF;
  IF _role IS NOT NULL THEN
    IF _role NOT IN ('admin','member') THEN RAISE EXCEPTION 'Invalid role'; END IF;
    IF _role <> m.role AND m.role = 'admin' THEN
      SELECT count(*) INTO admins FROM public.members WHERE household_id = hid AND role = 'admin';
      IF admins <= 1 THEN RAISE EXCEPTION 'Cannot remove the last adult'; END IF;
    END IF;
    UPDATE public.members SET role = _role WHERE id = m.id;
  END IF;
  IF _pin IS NOT NULL AND length(_pin) > 0 THEN
    IF _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
    BEGIN
      UPDATE public.members SET pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex') WHERE id = m.id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'PIN already in use';
    END;
  END IF;
END $function$;

GRANT EXECUTE ON FUNCTION public.update_member(text, text, text, text) TO authenticated;