BEGIN;

-- Management-only repair after the owner confirms an accidental unlink. Never
-- called by Auth or password recovery, and never exposed as a browser RPC.
CREATE FUNCTION homehub_private.restore_member_account(
 _household uuid,_key text,_account uuid,_expected_state text,_owner uuid,_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person record; recipient record; existing public.household_accounts;
BEGIN
 IF _household IS NULL OR _account IS NULL OR _owner IS NULL
   OR length(btrim(coalesce(_reason,''))) NOT BETWEEN 10 AND 500
   OR coalesce(_expected_state,'') !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'Account, expected state and restoration reason required' USING ERRCODE='22023';
 END IF;
 -- Same account-before-household order as invitation redemption/creation.
 PERFORM pg_advisory_xact_lock(hashtextextended(_account::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||_household::text,0));
 PERFORM 1 FROM auth.users u JOIN homehub_private.platform_owners o ON o.email=lower(u.email)
   JOIN public.user_roles r ON r.user_id=u.id AND r.role='platform_admin'
   WHERE u.id=_owner AND u.email_confirmed_at IS NOT NULL FOR SHARE OF u,o,r;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.households WHERE id=_household AND NOT suspended FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Household unavailable' USING ERRCODE='42501'; END IF;
 SELECT id,name,role INTO person FROM public.members WHERE household_id=_household AND key=_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='22023'; END IF;
 SELECT id,email,created_at INTO recipient FROM auth.users WHERE id=_account AND email_confirmed_at IS NOT NULL FOR SHARE;
 IF NOT FOUND OR recipient.email IS NULL THEN
   RAISE EXCEPTION 'Verified recipient required' USING ERRCODE='42501';
 END IF;
 -- A fresh account with the same address cannot inherit an older acceptance.
 IF NOT EXISTS(SELECT 1 FROM public.invites i
   WHERE i.household_id=_household AND i.target_member_key=_key AND i.created_by=_owner
     AND i.recipient_email=lower(recipient.email) AND i.used_at IS NOT NULL AND i.revoked_at IS NULL
     AND i.used_at>=recipient.created_at AND i.member_name=person.name AND i.role=person.role) THEN
   RAISE EXCEPTION 'Previously accepted member invitation required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO existing FROM public.household_accounts WHERE user_id=_account FOR UPDATE;
 IF FOUND THEN
   IF existing.household_id=_household AND existing.member_key=_key THEN RETURN false; END IF;
   RAISE EXCEPTION 'Recipient already belongs to a household' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.household_accounts WHERE household_id=_household AND member_key=_key) THEN
   RAISE EXCEPTION 'Member already has a linked account' USING ERRCODE='40001';
 END IF;
 IF homehub_private.member_account_state(_household,_key) IS DISTINCT FROM _expected_state THEN
   RAISE EXCEPTION 'Member account changed; review before restoring' USING ERRCODE='40001';
 END IF;
 UPDATE public.finance_sessions SET revoked=true WHERE user_id=_account AND NOT revoked;
 INSERT INTO public.household_accounts(user_id,household_id,member_key) VALUES(_account,_household,_key);
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details)
   VALUES(_owner,'member.account_restored',_account::text,
     jsonb_build_object('household_id',_household,'member_key',_key,'reason',btrim(_reason)));
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION homehub_private.restore_member_account(uuid,text,uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
