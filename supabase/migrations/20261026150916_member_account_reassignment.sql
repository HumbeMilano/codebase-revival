BEGIN;

-- Account changes re-use a member; normal invitations still create a member.
ALTER TABLE public.invites ADD COLUMN target_member_key text;
ALTER TABLE public.invites ADD COLUMN target_state_hash text;
ALTER TABLE public.invites ADD CONSTRAINT invite_target_member
  FOREIGN KEY(household_id,target_member_key) REFERENCES public.members(household_id,key) ON DELETE CASCADE;
ALTER TABLE public.invites ADD CONSTRAINT invite_target_binding CHECK (
  (target_member_key IS NULL AND target_state_hash IS NULL) OR
  (target_member_key IS NOT NULL AND recipient_email IS NOT NULL AND target_state_hash IS NOT NULL
    AND target_state_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX invite_target_lookup ON public.invites(household_id,target_member_key);

CREATE FUNCTION homehub_private.member_account_state(_household uuid,_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(extensions.digest(jsonb_build_object(
   'member_id',m.id,'name',m.name,'role',m.role,
   'accounts',coalesce((SELECT jsonb_agg(a.user_id ORDER BY a.user_id)
     FROM public.household_accounts a WHERE a.household_id=m.household_id AND a.member_key=m.key),'[]'::jsonb)
 )::text,'sha256'),'hex') FROM public.members m WHERE m.household_id=_household AND m.key=_key
$$;

-- Management-connection operation only. No public API or browser role can
-- prepare a reassignment or choose its administrative actor.
CREATE FUNCTION homehub_private.prepare_member_account_change(
 _household uuid,_key text,_name text,_email text,_owner uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person public.members; inv public.invites; recipient text:=lower(btrim(_email)); fingerprint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN homehub_private.platform_owners o ON o.email=lower(u.email)
   JOIN public.user_roles r ON r.user_id=u.id AND r.role='platform_admin'
   WHERE u.id=_owner AND u.email_confirmed_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 100
   OR length(coalesce(recipient,'')) NOT BETWEEN 3 AND 254
   OR recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
   RAISE EXCEPTION 'Valid name and email required' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||_household::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.households h WHERE h.id=_household AND NOT h.suspended) THEN
   RAISE EXCEPTION 'Household unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO person FROM public.members WHERE household_id=_household AND key=_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users u JOIN public.household_accounts a ON a.user_id=u.id WHERE lower(u.email)=recipient) THEN
   RAISE EXCEPTION 'Recipient already belongs to a household' USING ERRCODE='22023';
 END IF;
 fingerprint:=homehub_private.member_account_state(_household,_key);
 SELECT * INTO inv FROM public.invites WHERE household_id=_household AND target_member_key=_key
   AND target_state_hash=fingerprint AND recipient_email=recipient AND member_name=btrim(_name)
   AND delivery_status='pending' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()
   ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
 IF inv.code IS NULL THEN
   IF(SELECT count(*) FROM homehub_private.invite_email_attempts WHERE household_id=_household
     AND attempted_at>now()-interval '1 hour')>=20 THEN
     RAISE EXCEPTION 'Invitation email limit reached; try later' USING ERRCODE='54000';
   END IF;
   UPDATE public.invites SET revoked_at=now() WHERE household_id=_household AND target_member_key=_key
     AND used_at IS NULL AND revoked_at IS NULL;
   INSERT INTO public.invites(code,household_id,member_name,role,created_by,expires_at,
     recipient_email,delivery_status,target_member_key,target_state_hash,last_email_attempt_at)
   VALUES(upper(encode(extensions.gen_random_bytes(16),'hex')),_household,btrim(_name),person.role,_owner,
     now()+interval '7 days',recipient,'pending',_key,fingerprint,now()) RETURNING * INTO inv;
   INSERT INTO homehub_private.invite_email_attempts(household_id) VALUES(_household);
 END IF;
 RETURN jsonb_build_object('code',inv.code,'delivery_id',inv.email_delivery_id,'email',inv.recipient_email,
   'name',inv.member_name,'household_name',(SELECT name FROM public.households WHERE id=_household),
   'expires_at',inv.expires_at,'status',inv.delivery_status);
END $$;

CREATE FUNCTION homehub_private.confirm_member_account_invite_delivery(_code text,_delivery uuid,_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid;
BEGIN
 IF length(coalesce(_message,'')) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Delivery receipt required'; END IF;
 SELECT household_id INTO hid FROM public.invites WHERE code=_code AND target_member_key IS NOT NULL;
 IF hid IS NULL THEN RAISE EXCEPTION 'Account invitation not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||hid::text,0));
 UPDATE public.invites SET delivery_status='sent',email_message_id=_message
   WHERE code=_code AND email_delivery_id=_delivery AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation delivery changed' USING ERRCODE='40001'; END IF;
END $$;

REVOKE ALL ON FUNCTION homehub_private.member_account_state(uuid,text),
 homehub_private.prepare_member_account_change(uuid,text,text,text,uuid),
 homehub_private.confirm_member_account_invite_delivery(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.redeem_invite(_code text,_pin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.invites; person public.members; uid uuid:=auth.uid(); verified_email text;
 mkey text; old_accounts uuid[]; source_account uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
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
       VALUES(inv.household_id,mkey,inv.member_name,inv.role,encode(extensions.digest(_pin,'sha256'),'hex'));
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
     UPDATE public.members SET name=inv.member_name,pin_hash=encode(extensions.digest(_pin,'sha256'),'hex') WHERE id=person.id;
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
END $$;
REVOKE ALL ON FUNCTION public.redeem_invite(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text,text) TO authenticated;

COMMIT;
