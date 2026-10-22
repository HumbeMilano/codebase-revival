CREATE OR REPLACE FUNCTION public.redeem_invite(_code text,_pin text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE inv public.invites;mkey text:='m_'||encode(extensions.gen_random_bytes(8),'hex'); BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
 SELECT * INTO inv FROM public.invites WHERE code=upper(trim(_code)) AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF inv.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;
 IF EXISTS(SELECT 1 FROM public.household_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Already in household'; END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE household_id=inv.household_id AND pin_hash=encode(extensions.digest(_pin,'sha256'),'hex')) THEN RAISE EXCEPTION 'PIN already in use'; END IF;
 INSERT INTO public.members(household_id,key,name,role,pin_hash) VALUES(inv.household_id,mkey,inv.member_name,inv.role,encode(extensions.digest(_pin,'sha256'),'hex'));
 INSERT INTO public.household_accounts(user_id,household_id,member_key) VALUES(auth.uid(),inv.household_id,mkey);
 UPDATE public.invites SET used_at=now() WHERE code=inv.code; RETURN inv.household_id; END $$;
CREATE OR REPLACE FUNCTION public.revoke_finance_session(_token text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.finance_sessions s SET revoked=true WHERE s.token_hash=encode(extensions.digest(_token,'sha256'),'hex') AND ((s.user_id=auth.uid() AND s.auth_session=auth.jwt()->>'session_id') OR (auth.uid() IS NULL AND EXISTS(SELECT 1 FROM public.devices d WHERE d.id=s.device_id AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::json->>'x-device-token',''),'sha256'),'hex')))) $$;