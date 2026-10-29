BEGIN;

-- No PIN is configured until the member explicitly chooses one. Existing hashes,
-- profiles, revisions and household links remain untouched. NULL never matches
-- the shared server-side PIN check or its finance authorization path.

ALTER TABLE public.members ALTER COLUMN pin_hash DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_household(_name text, _member_name text, _pin text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE hid uuid;mkey text:='m_'||encode(extensions.gen_random_bytes(8),'hex'); BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF EXISTS(SELECT 1 FROM public.household_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Already in household'; END IF;
 IF nullif(_pin,'') IS NOT NULL AND _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
 IF _name IS NULL OR _member_name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 OR length(trim(_member_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
 INSERT INTO public.households(name) VALUES(trim(_name)) RETURNING id INTO hid;
 INSERT INTO public.members(household_id,key,name,role,pin_hash) VALUES(hid,mkey,trim(_member_name),'admin',encode(extensions.digest(nullif(_pin,''),'sha256'),'hex'));
 INSERT INTO public.household_accounts(user_id,household_id,member_key) VALUES(auth.uid(),hid,mkey); RETURN hid; END $function$;

CREATE OR REPLACE FUNCTION public.redeem_invite(_code text, _pin text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE inv public.invites; person public.members; uid uuid:=auth.uid(); verified_email text;
 mkey text; old_accounts uuid[]; source_account uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF nullif(_pin,'') IS NOT NULL AND _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
 -- Establish household-before-invitation lock order, also used by resending/revocation.
 SELECT * INTO inv FROM public.invites WHERE code=upper(btrim(_code))
   AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now();
 IF inv.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||inv.household_id::text,0));
 SELECT * INTO inv FROM public.invites WHERE code=upper(btrim(_code))
   AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF inv.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;
 SELECT lower(u.email) INTO verified_email FROM auth.users u
   WHERE u.id=uid AND u.email_confirmed_at IS NOT NULL FOR SHARE;
 IF inv.recipient_email IS NOT NULL AND (verified_email IS NULL OR verified_email<>inv.recipient_email) THEN
   RAISE EXCEPTION 'This invitation belongs to a different verified email' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.households WHERE id=inv.household_id AND suspended) THEN RAISE EXCEPTION 'Household suspended'; END IF;
 IF EXISTS(SELECT 1 FROM public.household_accounts WHERE user_id=uid) THEN RAISE EXCEPTION 'Already in household'; END IF;
 IF inv.target_member_key IS NULL THEN
   mkey:='m_'||encode(extensions.gen_random_bytes(8),'hex');
   BEGIN
     INSERT INTO public.members(household_id,key,name,role,pin_hash)
       VALUES(inv.household_id,mkey,inv.member_name,inv.role,encode(extensions.digest(nullif(_pin,''),'sha256'),'hex'));
   EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PIN already in use'; END;
   INSERT INTO public.household_accounts(user_id,household_id,member_key) VALUES(uid,inv.household_id,mkey);
 ELSE
   IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN homehub_private.platform_owners o ON o.email=lower(u.email)
     JOIN public.user_roles r ON r.user_id=u.id AND r.role='platform_admin'
     WHERE u.id=inv.created_by AND u.email_confirmed_at IS NOT NULL) THEN
     RAISE EXCEPTION 'Account invitation no longer authorized' USING ERRCODE='42501';
   END IF;
   SELECT * INTO person FROM public.members WHERE household_id=inv.household_id AND key=inv.target_member_key FOR UPDATE;
   IF person.id IS NULL OR inv.target_state_hash IS DISTINCT FROM homehub_private.member_account_state(inv.household_id,inv.target_member_key) THEN
     RAISE EXCEPTION 'Member account changed; request a new invitation' USING ERRCODE='40001';
   END IF;
   SELECT coalesce(array_agg(a.user_id ORDER BY a.created_at,a.user_id),'{}'::uuid[]) INTO old_accounts
     FROM public.household_accounts a WHERE a.household_id=inv.household_id AND a.member_key=person.key;
   source_account:=old_accounts[1];
   -- Inserting the replacement before removing old links preserves a connected adult.
   INSERT INTO public.household_accounts(user_id,household_id,member_key) VALUES(uid,inv.household_id,person.key);
   BEGIN
     UPDATE public.members SET name=inv.member_name,pin_hash=encode(extensions.digest(nullif(_pin,''),'sha256'),'hex') WHERE id=person.id;
   EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PIN already in use'; END;
   UPDATE public.finance_sessions SET revoked=true WHERE household_id=inv.household_id
     AND (user_id=ANY(old_accounts) OR authorized_by=person.id);
   DELETE FROM public.household_accounts WHERE household_id=inv.household_id AND member_key=person.key AND user_id<>uid;
   -- Layouts contain references only. Preserve the recipient's own layout if present.
   INSERT INTO public.dashboard_preferences(user_id,layout)
     SELECT uid,p.layout FROM public.dashboard_preferences p WHERE p.user_id=source_account ON CONFLICT(user_id) DO NOTHING;
   INSERT INTO public.profiles(id,preferred_view,time_format)
     SELECT uid,p.preferred_view,p.time_format FROM public.profiles p WHERE p.id=source_account
     ON CONFLICT(id) DO UPDATE SET preferred_view=excluded.preferred_view,time_format=excluded.time_format
       WHERE public.profiles.avatar_path IS NULL AND public.profiles.preferred_view='auto' AND public.profiles.time_format='24';
   UPDATE public.invites SET revoked_at=now() WHERE household_id=inv.household_id AND target_member_key=person.key
     AND code<>inv.code AND used_at IS NULL AND revoked_at IS NULL;
 END IF;
 UPDATE public.invites SET used_at=now() WHERE code=inv.code;
 RETURN inv.household_id;
END $function$;

-- A setup hint reveals only the current account member's configured state.
CREATE FUNCTION public.my_pin_configured() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; mkey text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Account required' USING ERRCODE='42501'; END IF;
 SELECT c.household_id,c.member_key INTO hid,mkey FROM public.my_context() c WHERE c.mode='account';
 IF hid IS NULL THEN RAISE EXCEPTION 'Household access denied' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.members m JOIN public.household_accounts a
   ON a.household_id=m.household_id AND a.member_key=m.key
   WHERE a.user_id=auth.uid() AND m.household_id=hid AND m.key=mkey AND m.pin_hash IS NOT NULL);
END $$;

-- Members may configure their own tablet PIN. This never accepts a member ID,
-- changes a role, links an account or bypasses the shared verification budget.
CREATE FUNCTION public.set_my_pin(_pin text,_account uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; mid uuid;
BEGIN
 IF _account IS NULL OR auth.uid() IS DISTINCT FROM _account THEN RAISE EXCEPTION 'Account changed' USING ERRCODE='42501'; END IF;
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid);
 SELECT m.id INTO mid FROM public.members m JOIN public.household_accounts a
   ON a.household_id=m.household_id AND a.member_key=m.key
   WHERE a.user_id=auth.uid() AND m.household_id=hid FOR UPDATE OF m;
 IF mid IS NULL THEN RAISE EXCEPTION 'Household access denied' USING ERRCODE='42501'; END IF;
 IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits' USING ERRCODE='22023'; END IF;
 BEGIN
   UPDATE public.members SET pin_hash=encode(extensions.digest(_pin,'sha256'),'hex') WHERE id=mid;
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PIN already in use' USING ERRCODE='23505'; END;
END $$;
REVOKE ALL ON FUNCTION public.my_pin_configured(),public.set_my_pin(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_pin_configured(),public.set_my_pin(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tablet_pairing_preview(_id uuid, _approval_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE hid uuid; r homehub_private.tablet_pairing_requests;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 SELECT * INTO r FROM homehub_private.tablet_pairing_requests WHERE id=_id AND approval_hash=encode(extensions.digest(coalesce(_approval_secret,''),'sha256'),'hex');
 IF r.id IS NULL OR r.expires_at<=now() OR r.cancelled_at IS NOT NULL OR(r.approved_by IS NOT NULL AND r.approved_by<>auth.uid()) THEN RAISE EXCEPTION 'Invalid or expired pairing request' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('name',r.name,'household_name',(SELECT name FROM public.households WHERE id=hid),'expires_at',r.expires_at,'status',CASE WHEN r.approved_by IS NULL THEN 'pending' ELSE 'approved' END,'requires_pin_setup',NOT public.my_pin_configured());
END $function$;

CREATE OR REPLACE FUNCTION public.approve_tablet_pairing(_id uuid, _approval_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE hid uuid; sid text:=auth.jwt()->>'session_id'; r homehub_private.tablet_pairing_requests;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF NOT public.my_pin_configured() THEN RAISE EXCEPTION 'Set your tablet PIN before pairing' USING ERRCODE='42501'; END IF;
 IF sid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id::text=sid AND s.user_id=auth.uid())
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a WHERE a->>'method'='passkey' AND (a->>'timestamp')::numeric BETWEEN extract(epoch FROM now()-interval '2 minutes') AND extract(epoch FROM now()+interval '30 seconds')) THEN RAISE EXCEPTION 'A fresh passkey verification is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM homehub_private.tablet_pairing_requests WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.approval_hash<>encode(extensions.digest(coalesce(_approval_secret,''),'sha256'),'hex') OR r.expires_at<=now() OR r.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid or expired pairing request' USING ERRCODE='42501'; END IF;
 IF r.approved_by IS NOT NULL THEN
  IF r.approved_by=auth.uid() AND r.household_id=hid AND r.approved_session_id=sid THEN RETURN; END IF;
  RAISE EXCEPTION 'Pairing request already approved' USING ERRCODE='42501';
 END IF;
 IF(SELECT count(*) FROM public.devices WHERE household_id=hid AND NOT revoked)>=20 THEN RAISE EXCEPTION 'Revoke an unused tablet before pairing another' USING ERRCODE='54000'; END IF;
 IF EXISTS(SELECT 1 FROM homehub_private.tablet_pairing_sessions WHERE session_id=sid) THEN RAISE EXCEPTION 'Passkey verification already used' USING ERRCODE='42501'; END IF;
 INSERT INTO homehub_private.tablet_pairing_sessions(session_id) VALUES(sid);
 UPDATE homehub_private.tablet_pairing_requests SET approved_by=auth.uid(),household_id=hid,approved_session_id=sid WHERE id=_id;
END $function$;

-- Keep the former passkey-only endpoint subject to the same account/PIN gate.
CREATE OR REPLACE FUNCTION public.pair_tablet_with_passkey(_name text DEFAULT 'Tablet del hogar'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE hid uuid; token text:=encode(extensions.gen_random_bytes(32),'hex'); sid text:=auth.jwt()->>'session_id';
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF NOT public.my_pin_configured() THEN RAISE EXCEPTION 'Set your tablet PIN before pairing' USING ERRCODE='42501'; END IF;
 IF sid IS NULL OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id::text=sid AND s.user_id=auth.uid())
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a WHERE a->>'method'='passkey' AND (a->>'timestamp')::numeric BETWEEN extract(epoch FROM now()-interval '2 minutes') AND extract(epoch FROM now()+interval '30 seconds')) THEN RAISE EXCEPTION 'A fresh passkey verification is required' USING ERRCODE='42501'; END IF;
 IF length(coalesce(_name,'')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Device name required' USING ERRCODE='22023'; END IF;
 IF(SELECT count(*) FROM public.devices WHERE household_id=hid AND NOT revoked)>=20 THEN RAISE EXCEPTION 'Revoke an unused tablet before pairing another' USING ERRCODE='54000'; END IF;
 INSERT INTO homehub_private.tablet_pairing_sessions(session_id) VALUES(sid);
 INSERT INTO public.devices(household_id,name,token_hash) VALUES(hid,trim(_name),encode(extensions.digest(token,'sha256'),'hex'));
 DELETE FROM homehub_private.tablet_pairing_sessions WHERE created_at<now()-interval '1 day';
 RETURN token;
END $function$;

COMMIT;
