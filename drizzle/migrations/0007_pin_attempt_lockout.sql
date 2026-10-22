CREATE TABLE public.pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pin_attempts_household_time ON public.pin_attempts (household_id, created_at);
GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verify_pin(_pin text, _admin_only boolean DEFAULT false)
RETURNS TABLE(key text, name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid; fails int;
BEGIN
  SELECT h INTO hid FROM public.current_household_ids() h LIMIT 1;
  IF hid IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO fails FROM public.pin_attempts a
    WHERE a.household_id = hid AND a.created_at > now() - interval '5 minutes';
  IF fails >= 5 THEN RETURN; END IF;
  RETURN QUERY SELECT m.key, m.name, m.role FROM public.members m
    WHERE m.household_id = hid
      AND m.pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
      AND (NOT _admin_only OR m.role = 'admin');
  IF NOT FOUND THEN
    INSERT INTO public.pin_attempts (household_id) VALUES (hid);
  ELSE
    DELETE FROM public.pin_attempts a WHERE a.household_id = hid;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.verify_pin(text, boolean) TO anon, authenticated;