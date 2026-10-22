CREATE TABLE public.finance_sessions (
 token_hash text PRIMARY KEY,
 household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
 user_id uuid,
 auth_session text,
 device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
 revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((user_id IS NOT NULL AND auth_session IS NOT NULL AND device_id IS NULL) OR (user_id IS NULL AND device_id IS NOT NULL))
);
GRANT ALL ON public.finance_sessions TO service_role;
ALTER TABLE public.finance_sessions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_access_finances(_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT _household IN (SELECT public.current_household_ids()) AND (
 public.is_household_admin(_household) OR EXISTS (
 SELECT 1 FROM public.finance_sessions s
 WHERE s.household_id = _household AND NOT s.revoked
 AND s.token_hash = encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::json->>'x-finance-token',''), 'sha256'),'hex')
 AND ((s.user_id = auth.uid() AND s.auth_session = auth.jwt()->>'session_id') OR
 (auth.uid() IS NULL AND EXISTS (SELECT 1 FROM public.devices d WHERE d.id=s.device_id AND NOT d.revoked AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::json->>'x-device-token',''),'sha256'),'hex'))))
 ));
$$;
REVOKE ALL ON FUNCTION public.can_access_finances(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_finances(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.authorize_finances(_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid; did uuid; token text := encode(extensions.gen_random_bytes(32),'hex');
BEGIN
 SELECT m.household_id INTO hid FROM public.members m WHERE m.household_id IN (SELECT public.current_household_ids()) AND m.role='admin' AND m.pin_hash=encode(extensions.digest(_pin,'sha256'),'hex') LIMIT 1;
 IF hid IS NULL THEN RETURN NULL; END IF;
 IF auth.uid() IS NULL THEN
 SELECT d.id INTO did FROM public.devices d WHERE d.household_id=hid AND NOT d.revoked AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::json->>'x-device-token',''),'sha256'),'hex');
 IF did IS NULL THEN RETURN NULL; END IF;
 END IF;
 IF auth.uid() IS NOT NULL AND auth.jwt()->>'session_id' IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.finance_sessions(token_hash,household_id,user_id,auth_session,device_id) VALUES(encode(extensions.digest(token,'sha256'),'hex'),hid,auth.uid(),auth.jwt()->>'session_id',did);
 RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.authorize_finances(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_finances(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.revoke_finance_session(_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.finance_sessions SET revoked=true WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex');
$$;
REVOKE ALL ON FUNCTION public.revoke_finance_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_finance_session(text) TO anon,authenticated;
DROP POLICY "household isolation" ON public.bills;
DROP POLICY "household isolation" ON public.contributions;
DROP POLICY "household isolation" ON public.bill_splits;
DROP POLICY "household isolation" ON public.bill_overrides;
CREATE POLICY "adult financial access" ON public.bills FOR ALL TO anon,authenticated USING (public.can_access_finances(household_id)) WITH CHECK (public.can_access_finances(household_id));
CREATE POLICY "adult financial access" ON public.contributions FOR ALL TO anon,authenticated USING (public.can_access_finances(household_id)) WITH CHECK (public.can_access_finances(household_id));
CREATE POLICY "adult financial access" ON public.bill_splits FOR ALL TO anon,authenticated USING (bill_id IN (SELECT id FROM public.bills)) WITH CHECK (bill_id IN (SELECT id FROM public.bills));
CREATE POLICY "adult financial access" ON public.bill_overrides FOR ALL TO anon,authenticated USING (bill_id IN (SELECT id FROM public.bills)) WITH CHECK (bill_id IN (SELECT id FROM public.bills));