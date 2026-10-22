BEGIN;

-- The public creation RPC requires a private Worker key. The Worker applies
-- per-IP limits before it can create a short-lived anonymous request.
CREATE TABLE homehub_private.tablet_pairing_keys (
 key_hash text PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE homehub_private.tablet_pairing_requests (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 claim_hash text NOT NULL CHECK(claim_hash ~ '^[a-f0-9]{64}$'),
 approval_hash text NOT NULL CHECK(approval_hash ~ '^[a-f0-9]{64}$'),
 token_seed text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 approved_by uuid REFERENCES auth.users ON DELETE SET NULL,
 household_id uuid REFERENCES public.households ON DELETE CASCADE,
 approved_session_id text,
 device_id uuid REFERENCES public.devices ON DELETE SET NULL,
 claimed_at timestamptz,
 cancelled_at timestamptz,
 CHECK(claim_hash<>approval_hash)
);
CREATE INDEX tablet_pairing_expiry ON homehub_private.tablet_pairing_requests(expires_at);
ALTER TABLE homehub_private.tablet_pairing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE homehub_private.tablet_pairing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.tablet_pairing_keys,homehub_private.tablet_pairing_requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.create_tablet_pairing(_id uuid,_name text,_claim_hash text,_approval_hash text,_server_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r homehub_private.tablet_pairing_requests;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM homehub_private.tablet_pairing_keys WHERE key_hash=encode(extensions.digest(coalesce(_server_key,''),'sha256'),'hex')) THEN RAISE EXCEPTION 'Pairing server authorization required' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 OR coalesce(_claim_hash,'') !~ '^[a-f0-9]{64}$' OR coalesce(_approval_hash,'') !~ '^[a-f0-9]{64}$' OR _claim_hash=_approval_hash THEN RAISE EXCEPTION 'Invalid pairing request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:pairing-create',0));
 DELETE FROM homehub_private.tablet_pairing_requests WHERE expires_at<now()-interval '2 minutes';
 SELECT * INTO r FROM homehub_private.tablet_pairing_requests WHERE id=_id;
 IF r.id IS NOT NULL THEN
  IF r.claim_hash<>_claim_hash OR r.approval_hash<>_approval_hash OR r.name<>trim(_name) OR r.cancelled_at IS NOT NULL OR r.expires_at<=now() THEN RAISE EXCEPTION 'Invalid pairing request' USING ERRCODE='22023'; END IF;
 ELSE
  IF(SELECT count(*) FROM homehub_private.tablet_pairing_requests WHERE expires_at>now() AND claimed_at IS NULL AND cancelled_at IS NULL)>=500 THEN RAISE EXCEPTION 'Pairing capacity reached; try later' USING ERRCODE='54000'; END IF;
  INSERT INTO homehub_private.tablet_pairing_requests(id,name,claim_hash,approval_hash) VALUES(_id,trim(_name),_claim_hash,_approval_hash) RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'name',r.name,'expires_at',r.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.create_tablet_pairing(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_tablet_pairing(uuid,text,text,text,text) TO anon;

CREATE FUNCTION public.tablet_pairing_status(_id uuid,_claim_secret text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r homehub_private.tablet_pairing_requests;
BEGIN
 SELECT * INTO r FROM homehub_private.tablet_pairing_requests WHERE id=_id AND claim_hash=encode(extensions.digest(coalesce(_claim_secret,''),'sha256'),'hex');
 IF r.id IS NULL THEN RAISE EXCEPTION 'Invalid pairing request' USING ERRCODE='42501'; END IF;
 IF r.cancelled_at IS NOT NULL OR r.expires_at<=now() THEN RETURN jsonb_build_object('status','expired'); END IF;
 RETURN jsonb_build_object('status',CASE WHEN r.claimed_at IS NOT NULL THEN 'claimed' WHEN r.approved_by IS NOT NULL THEN 'approved' ELSE 'pending' END,'expires_at',r.expires_at);
END $$;
CREATE FUNCTION public.cancel_tablet_pairing(_id uuid,_claim_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 UPDATE homehub_private.tablet_pairing_requests SET cancelled_at=now() WHERE id=_id AND claim_hash=encode(extensions.digest(coalesce(_claim_secret,''),'sha256'),'hex') AND claimed_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.tablet_pairing_status(uuid,text),public.cancel_tablet_pairing(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tablet_pairing_status(uuid,text),public.cancel_tablet_pairing(uuid,text) TO anon,authenticated;

CREATE FUNCTION public.tablet_pairing_preview(_id uuid,_approval_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; r homehub_private.tablet_pairing_requests;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
 SELECT * INTO r FROM homehub_private.tablet_pairing_requests WHERE id=_id AND approval_hash=encode(extensions.digest(coalesce(_approval_secret,''),'sha256'),'hex');
 IF r.id IS NULL OR r.expires_at<=now() OR r.cancelled_at IS NOT NULL OR(r.approved_by IS NOT NULL AND r.approved_by<>auth.uid()) THEN RAISE EXCEPTION 'Invalid or expired pairing request' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('name',r.name,'household_name',(SELECT name FROM public.households WHERE id=hid),'expires_at',r.expires_at,'status',CASE WHEN r.approved_by IS NULL THEN 'pending' ELSE 'approved' END);
END $$;

CREATE FUNCTION public.approve_tablet_pairing(_id uuid,_approval_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; sid text:=auth.jwt()->>'session_id'; r homehub_private.tablet_pairing_requests;
BEGIN
 SELECT c.household_id INTO hid FROM public.my_context() c WHERE c.mode='account';
 PERFORM homehub_private.lock_household(hid,true);
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
END $$;
REVOKE ALL ON FUNCTION public.tablet_pairing_preview(uuid,text),public.approve_tablet_pairing(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tablet_pairing_preview(uuid,text),public.approve_tablet_pairing(uuid,text) TO authenticated;

CREATE FUNCTION public.claim_tablet_pairing(_id uuid,_claim_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r homehub_private.tablet_pairing_requests; hid uuid; token text; did uuid;
BEGIN
 SELECT household_id INTO hid FROM homehub_private.tablet_pairing_requests WHERE id=_id AND claim_hash=encode(extensions.digest(coalesce(_claim_secret,''),'sha256'),'hex');
 IF hid IS NULL THEN RAISE EXCEPTION 'Pairing not approved' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||hid::text,0));
 SELECT * INTO r FROM homehub_private.tablet_pairing_requests WHERE id=_id FOR UPDATE;
 IF r.claim_hash<>encode(extensions.digest(coalesce(_claim_secret,''),'sha256'),'hex') OR r.cancelled_at IS NOT NULL OR (r.claimed_at IS NULL AND r.expires_at<=now()) OR r.expires_at<now()-interval '2 minutes' THEN RAISE EXCEPTION 'Invalid or expired pairing request' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.household_accounts a JOIN public.members m ON m.household_id=a.household_id AND m.key=a.member_key JOIN public.households h ON h.id=a.household_id WHERE a.user_id=r.approved_by AND a.household_id=hid AND m.role='admin' AND NOT h.suspended) THEN RAISE EXCEPTION 'Pairing approval no longer valid' USING ERRCODE='42501'; END IF;
 token:=encode(extensions.hmac(_claim_secret,r.token_seed,'sha256'),'hex');
 IF r.device_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.devices WHERE id=r.device_id AND household_id=hid AND NOT revoked) THEN RAISE EXCEPTION 'Device revoked' USING ERRCODE='42501'; END IF;
 ELSE
  IF r.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Device revoked' USING ERRCODE='42501'; END IF;
  IF(SELECT count(*) FROM public.devices WHERE household_id=hid AND NOT revoked)>=20 THEN RAISE EXCEPTION 'Revoke an unused tablet before pairing another' USING ERRCODE='54000'; END IF;
  INSERT INTO public.devices(household_id,name,token_hash) VALUES(hid,r.name,encode(extensions.digest(token,'sha256'),'hex')) RETURNING id INTO did;
  UPDATE homehub_private.tablet_pairing_requests SET device_id=did,claimed_at=now() WHERE id=_id;
 END IF;
 RETURN jsonb_build_object('token',token,'household_name',(SELECT name FROM public.households WHERE id=hid));
END $$;
REVOKE ALL ON FUNCTION public.claim_tablet_pairing(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tablet_pairing(uuid,text) TO anon,authenticated;

-- Existing accounts stay undisturbed. New profiles receive the guided tour;
-- any account can explicitly restart it from its own profile.
ALTER TABLE public.profiles ADD COLUMN onboarding_state jsonb NOT NULL DEFAULT '{"version":1,"seen":[],"dismissed":true}';
ALTER TABLE public.profiles ALTER COLUMN onboarding_state SET DEFAULT '{"version":1,"seen":[],"dismissed":false}';
ALTER TABLE public.profiles ADD CONSTRAINT onboarding_state_shape CHECK(onboarding_state ?& ARRAY['version','seen','dismissed'] AND onboarding_state->>'version'='1' AND jsonb_typeof(onboarding_state)='object' AND jsonb_typeof(onboarding_state->'seen')='array' AND jsonb_array_length(onboarding_state->'seen')<=7 AND onboarding_state->'seen'<@'["home","chores","shopping","finance","calendar","notes","household"]'::jsonb AND jsonb_typeof(onboarding_state->'dismissed')='boolean' AND octet_length(onboarding_state::text)<=2048);
CREATE FUNCTION public.save_onboarding_progress(_seen text[] DEFAULT '{}',_dismissed boolean DEFAULT false,_restart boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE state jsonb; visited jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
 IF cardinality(_seen) IS NULL OR cardinality(_seen)>7 OR EXISTS(SELECT 1 FROM unnest(_seen) s WHERE s IS NULL OR s NOT IN('home','chores','shopping','finance','calendar','notes','household')) THEN RAISE EXCEPTION 'Invalid tour progress' USING ERRCODE='22023'; END IF;
 SELECT onboarding_state INTO state FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
 IF _restart THEN state:='{"version":1,"seen":[],"dismissed":false}'; END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') INTO visited FROM(SELECT DISTINCT value v FROM jsonb_array_elements_text(state->'seen') UNION SELECT s FROM unnest(_seen) s) combined;
 state:=jsonb_build_object('version',1,'seen',visited,'dismissed',coalesce((state->>'dismissed')::boolean,false) OR coalesce(_dismissed,false));
 UPDATE public.profiles SET onboarding_state=state WHERE id=auth.uid();
 RETURN state;
END $$;
REVOKE ALL ON FUNCTION public.save_onboarding_progress(text[],boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(text[],boolean,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
