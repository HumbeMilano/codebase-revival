-- Forward-only hardening of the existing HomeHub schema. No household data is deleted.
BEGIN;
CREATE SCHEMA IF NOT EXISTS homehub_private;
REVOKE ALL ON SCHEMA homehub_private FROM PUBLIC, anon, authenticated;

-- A public signup must never bootstrap the administrator of the entire service.
CREATE OR REPLACE FUNCTION public.claim_platform_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Platform administrator must be provisioned by the service owner' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.claim_platform_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_household_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.household_id FROM public.household_accounts a JOIN public.households h ON h.id=a.household_id
  WHERE a.user_id=auth.uid() AND NOT h.suspended
  UNION
  SELECT d.household_id FROM public.devices d JOIN public.households h ON h.id=d.household_id
  WHERE auth.uid() IS NULL AND NOT d.revoked AND NOT h.suspended
    AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token',''),'sha256'),'hex')
    AND coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token','')<>''
$$;
REVOKE ALL ON FUNCTION public.current_household_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_household_ids() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_household_admin(_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.household_accounts a
    JOIN public.members m ON m.household_id=a.household_id AND m.key=a.member_key
    JOIN public.households h ON h.id=a.household_id
    WHERE a.user_id=auth.uid() AND a.household_id=_household AND m.role='admin' AND NOT h.suspended)
$$;
REVOKE ALL ON FUNCTION public.is_household_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_household_admin(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_context()
RETURNS TABLE(household_id uuid,household_name text,member_key text,mode text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.household_accounts a JOIN public.households h ON h.id=a.household_id WHERE a.user_id=auth.uid() AND h.suspended) THEN
      RAISE EXCEPTION 'Household suspended' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT h.id,h.name,a.member_key,'account'::text FROM public.household_accounts a JOIN public.households h ON h.id=a.household_id
      WHERE a.user_id=auth.uid() AND NOT h.suspended ORDER BY a.created_at LIMIT 1;
  ELSE
    IF EXISTS(SELECT 1 FROM public.devices d WHERE d.revoked AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token',''),'sha256'),'hex')) THEN
      RAISE EXCEPTION 'Device revoked' USING ERRCODE='42501';
    END IF;
    IF EXISTS(SELECT 1 FROM public.devices d JOIN public.households h ON h.id=d.household_id WHERE h.suspended AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token',''),'sha256'),'hex')) THEN
      RAISE EXCEPTION 'Household suspended' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT h.id,h.name,NULL::text,'device'::text FROM public.households h WHERE h.id IN(SELECT public.current_household_ids()) LIMIT 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION homehub_private.lock_household(_household uuid,_adult boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- A common lock is shared by member management, collection writes, PINs and bills.
  PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||_household::text,0));
  IF _household IS NULL OR NOT EXISTS(SELECT 1 FROM public.current_household_ids() h WHERE h=_household) THEN
    RAISE EXCEPTION 'Household access denied or suspended' USING ERRCODE='42501';
  END IF;
  IF _adult AND NOT public.is_household_admin(_household) THEN RAISE EXCEPTION 'Only adults can manage members' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION homehub_private.lock_household(uuid,boolean) FROM PUBLIC, anon, authenticated;

-- Both PIN entry points share a serialized rolling budget. Successful child PINs
-- do not erase failed adult guesses. Returning NULL lets failed attempts commit.
CREATE OR REPLACE FUNCTION homehub_private.check_pin(_pin text,_admin_only boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; mid uuid;
BEGIN
  SELECT h INTO hid FROM public.current_household_ids() h LIMIT 1;
  IF hid IS NULL THEN RETURN NULL; END IF;
  PERFORM homehub_private.lock_household(hid);
  DELETE FROM public.pin_attempts WHERE household_id=hid AND created_at<=now()-interval '5 minutes';
  IF (SELECT count(*) FROM public.pin_attempts WHERE household_id=hid)>=5 THEN RETURN NULL; END IF;
  SELECT m.id INTO mid FROM public.members m WHERE m.household_id=hid
    AND _pin ~ '^[0-9]{4}$' AND m.pin_hash=encode(extensions.digest(_pin,'sha256'),'hex') AND (NOT _admin_only OR m.role='admin');
  IF mid IS NULL THEN INSERT INTO public.pin_attempts(household_id) VALUES(hid); END IF;
  RETURN mid;
END $$;
REVOKE ALL ON FUNCTION homehub_private.check_pin(text,boolean) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.verify_pin(_pin text,_admin_only boolean DEFAULT false)
RETURNS TABLE(key text,name text,role text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mid uuid;
BEGIN mid:=homehub_private.check_pin(_pin,coalesce(_admin_only,false)); RETURN QUERY SELECT m.key,m.name,m.role FROM public.members m WHERE m.id=mid; END $$;
REVOKE ALL ON FUNCTION public.verify_pin(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_pin(text,boolean) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.pin_lock_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('locked',count(*)>=5,'retry_after',CASE WHEN count(*)>=5 THEN greatest(1,ceil(extract(epoch FROM(min(a.created_at)+interval '5 minutes'-now())))::int) ELSE 0 END)
 FROM public.pin_attempts a WHERE a.household_id IN(SELECT public.current_household_ids()) AND a.created_at>now()-interval '5 minutes'
$$;
REVOKE ALL ON FUNCTION public.pin_lock_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pin_lock_status() TO anon, authenticated;

ALTER TABLE public.finance_sessions ADD COLUMN expires_at timestamptz NOT NULL DEFAULT(now()+interval '15 minutes');
ALTER TABLE public.finance_sessions ADD COLUMN authorized_by uuid REFERENCES public.members(id) ON DELETE CASCADE;
-- Existing unbounded grants are deliberately invalidated during hardening.
UPDATE public.finance_sessions SET revoked=true WHERE authorized_by IS NULL;
CREATE INDEX finance_sessions_expiry ON public.finance_sessions(expires_at) WHERE NOT revoked;
CREATE OR REPLACE FUNCTION public.authorize_finances(_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mid uuid; hid uuid; did uuid; token text:=encode(extensions.gen_random_bytes(32),'hex');
BEGIN
  mid:=homehub_private.check_pin(_pin,true);
  IF mid IS NULL THEN RETURN NULL; END IF;
  SELECT m.household_id INTO hid FROM public.members m WHERE m.id=mid;
  DELETE FROM public.finance_sessions WHERE household_id=hid AND expires_at<now()-interval '1 day';
  IF auth.uid() IS NULL THEN
    SELECT d.id INTO did FROM public.devices d WHERE d.household_id=hid AND NOT d.revoked
      AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token',''),'sha256'),'hex');
    IF did IS NULL THEN RETURN NULL; END IF;
  ELSIF auth.jwt()->>'session_id' IS NULL THEN RETURN NULL;
  END IF;
  INSERT INTO public.finance_sessions(token_hash,household_id,user_id,auth_session,device_id,authorized_by,expires_at)
    VALUES(encode(extensions.digest(token,'sha256'),'hex'),hid,auth.uid(),auth.jwt()->>'session_id',did,mid,now()+interval '15 minutes');
  RETURN token;
END $$;
CREATE OR REPLACE FUNCTION public.can_access_finances(_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT _household IN (SELECT public.current_household_ids())
 AND (
   public.is_household_admin(_household)
   OR EXISTS (
     SELECT 1 FROM public.finance_sessions s
     JOIN public.members m ON m.id=s.authorized_by AND m.role='admin'
     WHERE s.household_id=_household AND NOT s.revoked AND s.expires_at>now()
       AND s.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-finance-token',''),'sha256'),'hex')
       AND (
         (s.user_id=auth.uid() AND s.auth_session=auth.jwt()->>'session_id')
         OR (
           auth.uid() IS NULL AND EXISTS (
             SELECT 1 FROM public.devices d WHERE d.id=s.device_id AND NOT d.revoked
               AND d.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token',''),'sha256'),'hex')
           )
         )
       )
   )
 )
$$;
CREATE OR REPLACE FUNCTION homehub_private.invalidate_member_finance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.pin_hash IS DISTINCT FROM NEW.pin_hash OR OLD.role IS DISTINCT FROM NEW.role THEN
    UPDATE public.finance_sessions SET revoked=true WHERE authorized_by=OLD.id OR(user_id IN(SELECT a.user_id FROM public.household_accounts a WHERE a.household_id=OLD.household_id AND a.member_key=OLD.key));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION homehub_private.invalidate_member_finance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER revoke_changed_member_finance AFTER UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION homehub_private.invalidate_member_finance();

-- Constraints are NOT VALID for legacy records: new/changed records are checked,
-- existing user history is retained for deliberate repair rather than deleted.
ALTER TABLE public.household_accounts ADD CONSTRAINT account_user_valid FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.chores ADD CONSTRAINT chore_title_valid CHECK(length(btrim(title)) BETWEEN 1 AND 500) NOT VALID;
ALTER TABLE public.shopping_items ADD CONSTRAINT shopping_name_valid CHECK(length(btrim(name)) BETWEEN 1 AND 300) NOT VALID;
ALTER TABLE public.events ADD CONSTRAINT event_text_valid CHECK(length(btrim(title)) BETWEEN 1 AND 500 AND length(note)<=20000 AND(time='' OR time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) NOT VALID;
ALTER TABLE public.notes ADD CONSTRAINT note_text_valid CHECK(length(btrim(title)) BETWEEN 1 AND 500 AND length(body)<=20000) NOT VALID;
ALTER TABLE public.bills ADD CONSTRAINT bill_text_valid CHECK(length(btrim(name)) BETWEEN 1 AND 100 AND length(btrim(category)) BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE public.contributions ADD CONSTRAINT contribution_note_valid CHECK(length(note)<=2000) NOT VALID;
ALTER TABLE public.invites ADD CONSTRAINT invite_role_valid CHECK(role IN('admin','member')) NOT VALID;
ALTER TABLE public.members ADD CONSTRAINT member_role_valid CHECK(role IN('admin','member')) NOT VALID;
ALTER TABLE public.bills ADD CONSTRAINT bills_amount_valid CHECK(base>0 AND base<'Infinity'::numeric AND scale(base)<=2) NOT VALID;
ALTER TABLE public.bills ADD CONSTRAINT bills_due_day_valid CHECK(due_day BETWEEN 1 AND 31) NOT VALID;
ALTER TABLE public.contributions ADD CONSTRAINT contribution_amount_valid CHECK(amount>0 AND amount<'Infinity'::numeric AND scale(amount)<=2) NOT VALID;
ALTER TABLE public.contributions ADD CONSTRAINT contribution_month_valid CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') NOT VALID;
ALTER TABLE public.bill_overrides ADD CONSTRAINT override_amount_valid CHECK(amount IS NULL OR(amount>0 AND amount<'Infinity'::numeric AND scale(amount)<=2)) NOT VALID;
ALTER TABLE public.bill_overrides ADD CONSTRAINT override_month_valid CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') NOT VALID;
ALTER TABLE public.bill_overrides ADD CONSTRAINT override_status_valid CHECK(status IS NULL OR status IN('paid','pending')) NOT VALID;
ALTER TABLE public.bill_splits ADD CONSTRAINT split_value_valid CHECK(type IN('equal','amount','percent') AND value>=0 AND value<'Infinity'::numeric AND scale(value)<=2 AND(type<>'percent' OR value<=100)) NOT VALID;
ALTER TABLE public.chores ADD CONSTRAINT chore_member_valid FOREIGN KEY(household_id,member_key) REFERENCES public.members(household_id,key) NOT VALID;
ALTER TABLE public.events ADD CONSTRAINT event_member_valid FOREIGN KEY(household_id,member_key) REFERENCES public.members(household_id,key) NOT VALID;
ALTER TABLE public.notes ADD CONSTRAINT note_member_valid FOREIGN KEY(household_id,member_key) REFERENCES public.members(household_id,key) NOT VALID;
ALTER TABLE public.contributions ADD CONSTRAINT contribution_member_valid FOREIGN KEY(household_id,person_key) REFERENCES public.members(household_id,key) NOT VALID;
ALTER TABLE public.household_accounts ADD CONSTRAINT account_member_valid FOREIGN KEY(household_id,member_key) REFERENCES public.members(household_id,key) NOT VALID;
ALTER TABLE public.bills ADD CONSTRAINT bill_household_identity UNIQUE(id,household_id);
ALTER TABLE public.bill_splits ADD COLUMN household_id uuid;
UPDATE public.bill_splits s SET household_id=b.household_id FROM public.bills b WHERE b.id=s.bill_id;
ALTER TABLE public.bill_splits ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.bill_splits ADD CONSTRAINT split_household_valid FOREIGN KEY(bill_id,household_id) REFERENCES public.bills(id,household_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.bill_splits ADD CONSTRAINT split_member_valid FOREIGN KEY(household_id,person_key) REFERENCES public.members(household_id,key) NOT VALID;

ALTER TABLE public.chores ADD COLUMN due_date date;
UPDATE public.chores SET due_date=current_date+CASE WHEN when_label='Mañana' THEN 1 WHEN when_label='Esta semana' THEN 6 ELSE 0 END;
CREATE OR REPLACE FUNCTION homehub_private.bump_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.revision:=OLD.revision+1; IF TG_TABLE_NAME='notes' THEN NEW.updated_at:=now(); END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION homehub_private.bump_revision() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['chores','shopping_items','events','notes','contributions','bills'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN revision bigint NOT NULL DEFAULT 1',tab);
  EXECUTE format('CREATE TRIGGER bump_revision BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION homehub_private.bump_revision()',tab);
  EXECUTE format('CREATE INDEX ON public.%I(household_id)',tab);
 END LOOP;
END $$;
CREATE INDEX bill_splits_bill_lookup ON public.bill_splits(bill_id);
CREATE INDEX household_accounts_household_lookup ON public.household_accounts(household_id);
CREATE INDEX events_household_date ON public.events(household_id,date);

-- Members are managed under the same household lock; historical references cannot
-- disappear. Account unlinking and leaving preserve the member and their history.
CREATE OR REPLACE FUNCTION public.create_member(_name text,_role text,_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; mkey text:='m_'||encode(extensions.gen_random_bytes(8),'hex');
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 IF _role IS NULL OR _role NOT IN('admin','member') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
 IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
 BEGIN INSERT INTO public.members(household_id,key,name,role,pin_hash) VALUES(hid,mkey,trim(_name),_role,encode(extensions.digest(_pin,'sha256'),'hex'));
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PIN already in use'; END;
 RETURN mkey;
END $$;
CREATE OR REPLACE FUNCTION public.update_member(_key text,_name text DEFAULT NULL,_role text DEFAULT NULL,_pin text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; m public.members;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account'; PERFORM homehub_private.lock_household(hid,true);
 SELECT * INTO m FROM public.members WHERE household_id=hid AND key=_key FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
 IF _name IS NOT NULL AND length(trim(_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
 IF _role IS NOT NULL AND _role NOT IN('admin','member') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF _role='member' AND m.role='admin' THEN
  IF(SELECT count(*) FROM public.members WHERE household_id=hid AND role='admin')<=1 THEN RAISE EXCEPTION 'Cannot remove the last adult'; END IF;
  IF EXISTS(SELECT 1 FROM public.household_accounts WHERE household_id=hid AND member_key=m.key)
    AND NOT EXISTS(SELECT 1 FROM public.household_accounts a JOIN public.members x ON x.household_id=a.household_id AND x.key=a.member_key WHERE a.household_id=hid AND x.role='admin' AND x.key<>m.key) THEN
    RAISE EXCEPTION 'Cannot unlink the last adult account'; END IF;
 END IF;
 IF coalesce(_pin,'')<>'' AND _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
 BEGIN UPDATE public.members SET name=coalesce(trim(_name),name),role=coalesce(_role,role),pin_hash=CASE WHEN coalesce(_pin,'')='' THEN pin_hash ELSE encode(extensions.digest(_pin,'sha256'),'hex') END WHERE id=m.id;
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PIN already in use'; END;
END $$;
CREATE OR REPLACE FUNCTION public.delete_member(_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; m public.members;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account'; PERFORM homehub_private.lock_household(hid,true);
 SELECT * INTO m FROM public.members WHERE household_id=hid AND key=_key FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.household_accounts WHERE household_id=hid AND member_key=_key) THEN RAISE EXCEPTION 'Member has a linked account'; END IF;
 IF m.role='admin' AND(SELECT count(*) FROM public.members WHERE household_id=hid AND role='admin')<=1 THEN RAISE EXCEPTION 'Cannot remove the last adult'; END IF;
 IF EXISTS(SELECT 1 FROM public.chores WHERE household_id=hid AND member_key=_key) OR EXISTS(SELECT 1 FROM public.events WHERE household_id=hid AND member_key=_key)
  OR EXISTS(SELECT 1 FROM public.notes WHERE household_id=hid AND member_key=_key) OR EXISTS(SELECT 1 FROM public.contributions WHERE household_id=hid AND person_key=_key)
  OR EXISTS(SELECT 1 FROM public.bill_splits WHERE household_id=hid AND person_key=_key) THEN RAISE EXCEPTION 'Member has household history'; END IF;
 DELETE FROM public.members WHERE id=m.id;
END $$;
CREATE OR REPLACE FUNCTION public.list_member_accounts()
RETURNS TABLE(key text,linked boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 IF NOT coalesce(public.is_household_admin(hid),false) THEN RAISE EXCEPTION 'Only adults can manage members' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.key,EXISTS(SELECT 1 FROM public.household_accounts a WHERE a.household_id=hid AND a.member_key=m.key) FROM public.members m WHERE m.household_id=hid;
END $$;
CREATE OR REPLACE FUNCTION homehub_private.unlink_account(_household uuid,_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.members m WHERE m.household_id=_household AND m.key=_key AND m.role='admin')
  AND NOT EXISTS(SELECT 1 FROM public.household_accounts a JOIN public.members m ON m.household_id=a.household_id AND m.key=a.member_key WHERE a.household_id=_household AND m.role='admin' AND m.key<>_key) THEN RAISE EXCEPTION 'Cannot unlink the last adult account'; END IF;
 UPDATE public.finance_sessions SET revoked=true WHERE household_id=_household AND user_id IN(SELECT user_id FROM public.household_accounts WHERE household_id=_household AND member_key=_key);
 DELETE FROM public.household_accounts WHERE household_id=_household AND member_key=_key;
END $$;
REVOKE ALL ON FUNCTION homehub_private.unlink_account(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.unlink_member(_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; mine text;
BEGIN
 SELECT c.household_id,c.member_key INTO hid,mine FROM public.my_context() c WHERE c.mode='account'; PERFORM homehub_private.lock_household(hid,true);
 IF _key=mine THEN RAISE EXCEPTION 'Use leave household to unlink your own account'; END IF;
 PERFORM homehub_private.unlink_account(hid,_key);
END $$;
CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; mine text;
BEGIN
 SELECT c.household_id,c.member_key INTO hid,mine FROM public.my_context() c WHERE c.mode='account'; PERFORM homehub_private.lock_household(hid);
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM homehub_private.unlink_account(hid,mine);
END $$;
REVOKE ALL ON FUNCTION public.list_member_accounts(),public.unlink_member(text),public.leave_household() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_member_accounts(),public.unlink_member(text),public.leave_household() TO authenticated;

-- Invitation redemption and device pairing must also reject suspended homes.
CREATE OR REPLACE FUNCTION public.redeem_invite(_code text,_pin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.invites; mkey text:='m_'||encode(extensions.gen_random_bytes(8),'hex');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'PIN must be 4 digits'; END IF;
 SELECT * INTO inv FROM public.invites WHERE code=upper(trim(_code)) AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF inv.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired invite'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||inv.household_id::text,0));
 IF EXISTS(SELECT 1 FROM public.households WHERE id=inv.household_id AND suspended) THEN RAISE EXCEPTION 'Household suspended'; END IF;
 IF EXISTS(SELECT 1 FROM public.household_accounts WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Already in household'; END IF;
 BEGIN INSERT INTO public.members(household_id,key,name,role,pin_hash) VALUES(inv.household_id,mkey,inv.member_name,inv.role,encode(extensions.digest(_pin,'sha256'),'hex'));
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PIN already in use'; END;
 INSERT INTO public.household_accounts(user_id,household_id,member_key) VALUES(auth.uid(),inv.household_id,mkey);
 UPDATE public.invites SET used_at=now() WHERE code=inv.code; RETURN inv.household_id;
END $$;
CREATE OR REPLACE FUNCTION public.create_pairing_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE hid uuid; c text; tries int:=0;
BEGIN
 SELECT x.household_id INTO hid FROM public.my_context() x WHERE x.mode='account'; PERFORM homehub_private.lock_household(hid,true);
 LOOP
  c:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,12));
  BEGIN INSERT INTO public.pairing_codes(code,household_id,expires_at) VALUES(c,hid,now()+interval '10 minutes'); EXIT;
  EXCEPTION WHEN unique_violation THEN tries:=tries+1; IF tries>=5 THEN RAISE; END IF; END;
 END LOOP; RETURN c;
END $$;
-- Expire legacy/demo credentials while retaining their audit rows.
UPDATE public.pairing_codes SET expires_at=least(expires_at,now()) WHERE code !~ '^[A-F0-9]{12}$';
CREATE OR REPLACE FUNCTION public.pair_device(_code text,_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pc public.pairing_codes; tok text:=encode(extensions.gen_random_bytes(32),'hex');
BEGIN
 IF _code IS NULL OR upper(trim(_code)) !~ '^[A-F0-9]{12}$' THEN RAISE EXCEPTION 'Invalid or expired code'; END IF;
 SELECT * INTO pc FROM public.pairing_codes WHERE code=upper(trim(_code)) AND expires_at>now() AND uses<max_uses FOR UPDATE;
 IF pc.code IS NULL THEN RAISE EXCEPTION 'Invalid or expired code'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||pc.household_id::text,0));
 IF EXISTS(SELECT 1 FROM public.households WHERE id=pc.household_id AND suspended) THEN RAISE EXCEPTION 'Household suspended'; END IF;
 IF length(coalesce(_name,''))>100 THEN RAISE EXCEPTION 'Name too long'; END IF;
 UPDATE public.pairing_codes SET uses=uses+1 WHERE code=pc.code;
 INSERT INTO public.devices(household_id,name,token_hash) VALUES(pc.household_id,coalesce(nullif(trim(_name),''),'Tablet'),encode(extensions.digest(tok,'sha256'),'hex'));
 RETURN tok;
END $$;

-- A single collection request is atomic and rejects stale revisions. Values have
-- a fixed per-table allowlist; no client can write household_id/revision or SQL.
CREATE OR REPLACE FUNCTION public.save_collection(_table text,_household uuid,_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cols text[]; defaults jsonb; change jsonb; vals jsonb; oldrow jsonb; saved jsonb; result jsonb:='[]'; rid uuid; expected bigint; collist text; expressions text; assignments text;
BEGIN
 PERFORM homehub_private.lock_household(_household);
 CASE _table
  WHEN 'chores' THEN cols:=ARRAY['title','member_key','done','when_label','position','due_date']; defaults:='{"done":false,"when_label":"Hoy","position":0}';
  WHEN 'shopping_items' THEN cols:=ARRAY['name','done','position']; defaults:='{"done":false,"position":0}';
  WHEN 'events' THEN cols:=ARRAY['title','date','time','member_key','note']; defaults:='{"time":"","note":""}';
  WHEN 'notes' THEN cols:=ARRAY['title','body','member_key','pinned']; defaults:='{"body":"","pinned":false}';
  WHEN 'contributions' THEN cols:=ARRAY['person_key','amount','month','note']; defaults:='{"note":""}';
  ELSE RAISE EXCEPTION 'Invalid collection' USING ERRCODE='22023';
 END CASE;
 IF _table='contributions' AND NOT public.can_access_finances(_household) THEN RAISE EXCEPTION 'Financial authorization required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_changes)>500 THEN RAISE EXCEPTION 'Invalid changes' USING ERRCODE='22023'; END IF;
 SELECT string_agg(format('%I',c),','),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',_table,c),','),string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',c,_table,c),',') INTO collist,expressions,assignments FROM unnest(cols) c;
 FOR change IN SELECT value FROM jsonb_array_elements(_changes) LOOP
  rid:=(change->>'id')::uuid; expected:=(change->>'expected_revision')::bigint;
  IF rid IS NULL OR coalesce(change->>'operation','') NOT IN('insert','update','delete') THEN RAISE EXCEPTION 'Invalid change' USING ERRCODE='22023'; END IF;
  vals:=coalesce(change->'values','{}');
  IF jsonb_typeof(vals) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(vals) k WHERE NOT k=ANY(cols)) THEN RAISE EXCEPTION 'Invalid fields' USING ERRCODE='22023'; END IF;
  oldrow:=NULL;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND household_id=$2 FOR UPDATE',_table) INTO oldrow USING rid,_household;
  IF change->>'operation'='insert' THEN
   IF oldrow IS NOT NULL OR expected IS NOT NULL THEN RAISE EXCEPTION 'Record changed; refresh and retry' USING ERRCODE='40001'; END IF;
   vals:=defaults||vals;
   EXECUTE format('INSERT INTO public.%I(id,household_id,%s) SELECT $2,$3,%s RETURNING to_jsonb(%I.*)',_table,collist,expressions,_table) INTO saved USING vals,rid,_household;
  ELSE
   IF oldrow IS NULL OR expected IS NULL OR(oldrow->>'revision')::bigint<>expected THEN RAISE EXCEPTION 'Record changed; refresh and retry' USING ERRCODE='40001'; END IF;
   IF change->>'operation'='delete' THEN
    EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND household_id=$2',_table) USING rid,_household;
    CONTINUE;
   END IF;
   vals:=oldrow||vals;
   EXECUTE format('UPDATE public.%I SET %s WHERE id=$2 AND household_id=$3 RETURNING to_jsonb(%I.*)',_table,assignments,_table) INTO saved USING vals,rid,_household;
  END IF;
  IF _table='notes' AND change->>'operation'='insert' THEN
   -- The timestamp is always generated by the database, never supplied by clients.
   NULL;
  END IF;
  result:=result||jsonb_build_array(saved);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_collection(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_collection(text,uuid,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION homehub_private.validate_splits(_amount numeric,_splits jsonb,_household uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fixed numeric; pct numeric; equals int;
BEGIN
 IF _amount IS NULL OR _amount<=0 OR _amount>='Infinity'::numeric OR scale(_amount)>2 THEN RAISE EXCEPTION 'Invalid bill amount' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(_splits)=0 OR jsonb_array_length(_splits)>100 THEN RAISE EXCEPTION 'Choose at least one person' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_splits) s WHERE NOT EXISTS(SELECT 1 FROM public.members m WHERE m.household_id=_household AND m.key=s->>'person_key')
   OR coalesce(s->>'type','') NOT IN('amount','percent','equal') OR(s->>'value') IS NULL OR(s->>'value')::numeric<0 OR(s->>'value')::numeric>='Infinity'::numeric OR scale((s->>'value')::numeric)>2) THEN RAISE EXCEPTION 'Invalid split or household member' USING ERRCODE='22023'; END IF;
 IF(SELECT count(*) FROM jsonb_array_elements(_splits))<>(SELECT count(DISTINCT s->>'person_key') FROM jsonb_array_elements(_splits) s) THEN RAISE EXCEPTION 'Duplicate split member' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum((s->>'value')::numeric) FILTER(WHERE s->>'type'='amount'),0),coalesce(sum((s->>'value')::numeric) FILTER(WHERE s->>'type'='percent'),0),count(*) FILTER(WHERE s->>'type'='equal') INTO fixed,pct,equals FROM jsonb_array_elements(_splits) s;
 IF fixed>_amount OR pct>100 OR(equals=0 AND fixed<_amount AND pct<>100) THEN RAISE EXCEPTION 'Split total must match bill amount' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION homehub_private.validate_splits(numeric,jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.save_bill(_household uuid,_bill jsonb,_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid:=(_bill->>'id')::uuid; previous public.bills; saved public.bills; splits jsonb:=_bill->'splits'; overrides jsonb:=coalesce(_bill->'overrides','[]'); item jsonb;
BEGIN
 PERFORM homehub_private.lock_household(_household);
 IF NOT public.can_access_finances(_household) THEN RAISE EXCEPTION 'Financial authorization required' USING ERRCODE='42501'; END IF;
 IF rid IS NULL OR length(trim(coalesce(_bill->>'name',''))) NOT BETWEEN 1 AND 100 OR length(coalesce(_bill->>'category','')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Bill name and category required' USING ERRCODE='22023'; END IF;
 PERFORM homehub_private.validate_splits((_bill->>'base')::numeric,splits,_household);
 IF jsonb_typeof(overrides) IS DISTINCT FROM 'array' OR jsonb_array_length(overrides)>1200 THEN RAISE EXCEPTION 'Invalid monthly overrides' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(overrides) LOOP
  PERFORM homehub_private.validate_splits(coalesce((item->>'amount')::numeric,(_bill->>'base')::numeric),splits,_household);
 END LOOP;
 SELECT * INTO previous FROM public.bills WHERE id=rid FOR UPDATE;
 IF previous.id IS NOT NULL AND(previous.household_id<>_household OR _expected_revision IS NULL OR previous.revision<>_expected_revision) THEN RAISE EXCEPTION 'Record changed; refresh and retry' USING ERRCODE='40001'; END IF;
 IF previous.id IS NULL THEN
  IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'Record changed; refresh and retry' USING ERRCODE='40001'; END IF;
  INSERT INTO public.bills(id,household_id,name,category,base,due_day,auto_pay,position) VALUES(rid,_household,trim(_bill->>'name'),_bill->>'category',(_bill->>'base')::numeric,(_bill->>'due_day')::int,coalesce((_bill->>'auto_pay')::boolean,false),coalesce((_bill->>'position')::int,0)) RETURNING * INTO saved;
 ELSE
  UPDATE public.bills SET name=trim(_bill->>'name'),category=_bill->>'category',base=(_bill->>'base')::numeric,due_day=(_bill->>'due_day')::int,auto_pay=coalesce((_bill->>'auto_pay')::boolean,false),position=coalesce((_bill->>'position')::int,0) WHERE id=rid RETURNING * INTO saved;
 END IF;
 DELETE FROM public.bill_splits WHERE bill_id=rid;
 INSERT INTO public.bill_splits(bill_id,household_id,person_key,type,value) SELECT rid,_household,s->>'person_key',s->>'type',(s->>'value')::numeric FROM jsonb_array_elements(splits) s;
 DELETE FROM public.bill_overrides WHERE bill_id=rid;
 INSERT INTO public.bill_overrides(bill_id,month,amount,status,hidden) SELECT rid,o->>'month',(o->>'amount')::numeric,o->>'status',coalesce((o->>'hidden')::boolean,false) FROM jsonb_array_elements(overrides) o;
 RETURN to_jsonb(saved);
END $$;
CREATE OR REPLACE FUNCTION public.delete_bill(_id uuid,_expected_revision bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.bills;
BEGIN
 SELECT * INTO b FROM public.bills WHERE id=_id;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Record changed; refresh and retry' USING ERRCODE='40001'; END IF;
 PERFORM homehub_private.lock_household(b.household_id);
 IF NOT public.can_access_finances(b.household_id) THEN RAISE EXCEPTION 'Financial authorization required' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.bills WHERE id=_id FOR UPDATE;
 IF b.id IS NULL OR _expected_revision IS NULL OR b.revision<>_expected_revision THEN RAISE EXCEPTION 'Record changed; refresh and retry' USING ERRCODE='40001'; END IF;
 DELETE FROM public.bills WHERE id=_id;
END $$;
REVOKE ALL ON FUNCTION public.save_bill(uuid,jsonb,bigint),public.delete_bill(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_bill(uuid,jsonb,bigint),public.delete_bill(uuid,bigint) TO anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.chores,public.shopping_items,public.events,public.notes,public.contributions,public.bills,public.bill_splits,public.bill_overrides FROM anon,authenticated;

-- Personal avatars remain private, bounded and reproducible on fresh installs.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('personal-avatars','personal-avatars',false,2097152,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=2097152,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
NOTIFY pgrst,'reload schema';
COMMIT;
