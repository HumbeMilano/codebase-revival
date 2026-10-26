BEGIN;
-- Preparation-stage business rules. Test payments never update households.plan.
CREATE TABLE homehub_private.legal_profile (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), company_formed boolean NOT NULL DEFAULT false,
 operator_name text NOT NULL DEFAULT '', operator_state text NOT NULL DEFAULT '', operator_address text NOT NULL DEFAULT '',
 support_email text NOT NULL DEFAULT '', privacy_email text NOT NULL DEFAULT '', copyright_name text NOT NULL DEFAULT '',
 copyright_address text NOT NULL DEFAULT '', copyright_phone text NOT NULL DEFAULT '', copyright_email text NOT NULL DEFAULT '',
 dmca_registered boolean NOT NULL DEFAULT false, reviewed boolean NOT NULL DEFAULT false,
 minimum_age integer NOT NULL DEFAULT 13 CHECK(minimum_age=13), administrator_age integer NOT NULL DEFAULT 18 CHECK(administrator_age=18),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','reviewed')), revision integer NOT NULL DEFAULT 1 CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO homehub_private.legal_profile(id) VALUES(true);
ALTER TABLE homehub_private.legal_profile ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.legal_profile FROM PUBLIC,anon,authenticated;
ALTER TABLE homehub_private.business_plans ADD COLUMN limits jsonb NOT NULL DEFAULT '{"members":4,"lists":3,"devices":1,"photos":3,"widgets":6}';
UPDATE homehub_private.business_plans SET limits='{"members":12,"lists":20,"devices":3,"photos":12,"widgets":64}' WHERE id='pro';
UPDATE homehub_private.business_plans SET name=CASE id WHEN 'free' THEN 'Skendal Free' ELSE 'Skendal Pro' END WHERE name IN('HomeHub','Family Pro');
CREATE FUNCTION homehub_private.valid_plan_limits(_v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; n numeric;
BEGIN
 IF jsonb_typeof(_v) IS DISTINCT FROM 'object' OR _v-ARRAY['members','lists','devices','photos','widgets']<>'{}'::jsonb THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['members','lists','devices','photos','widgets'] LOOP
  IF jsonb_typeof(_v->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(_v->>k)::numeric;
  IF n<>trunc(n) OR n<1 OR n>(CASE k WHEN 'members' THEN 50 WHEN 'lists' THEN 20 WHEN 'devices' THEN 20 WHEN 'photos' THEN 12 ELSE 64 END) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION homehub_private.valid_plan_limits(jsonb) FROM PUBLIC,anon,authenticated;
ALTER TABLE homehub_private.business_plans ADD CONSTRAINT plan_limits_valid CHECK(homehub_private.valid_plan_limits(limits));
CREATE TABLE homehub_private.business_rollout(id boolean PRIMARY KEY DEFAULT true CHECK(id),limits_enabled boolean NOT NULL DEFAULT false,commercial_launch boolean NOT NULL DEFAULT false CHECK(NOT commercial_launch));
INSERT INTO homehub_private.business_rollout(id) VALUES(true);
ALTER TABLE homehub_private.business_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.business_rollout FROM PUBLIC,anon,authenticated;

CREATE TABLE homehub_private.privacy_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN('access','correction','deletion')), detail text NOT NULL DEFAULT '' CHECK(length(detail)<=2000),
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','reviewing','completed','declined')), resolution text NOT NULL DEFAULT '' CHECK(length(resolution)<=4000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_requests_user_idx ON homehub_private.privacy_requests(user_id,created_at);
ALTER TABLE homehub_private.privacy_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.privacy_requests FROM PUBLIC,anon,authenticated;

CREATE TABLE homehub_private.subscription_test_jobs (
 id uuid PRIMARY KEY, requested_by uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 key_hash text NOT NULL UNIQUE CHECK(key_hash ~ '^[a-f0-9]{64}$'), cleanup_hash text NOT NULL CHECK(cleanup_hash ~ '^[a-f0-9]{64}$'),
 scenario text NOT NULL CHECK(scenario IN('checkout','clock-month','clock-year')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour', created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'new' CHECK(state IN('new','creating','ready','cleaning','cleaned','failed')),
 user_id uuid REFERENCES auth.users ON DELETE SET NULL, household_id uuid REFERENCES public.households ON DELETE SET NULL,
 test_clock_id text, provider_customer_id text, cleanup_started_at timestamptz,
 CHECK(expires_at<=created_at+interval '2 hours')
);
ALTER TABLE homehub_private.subscription_test_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.subscription_test_jobs FROM PUBLIC,anon,authenticated;
CREATE TABLE homehub_private.sandbox_catalog (
 plan_revision integer PRIMARY KEY, product_id text NOT NULL, month_price_id text NOT NULL, year_price_id text NOT NULL,
 monthly_amount integer NOT NULL, annual_amount integer NOT NULL, currency text NOT NULL, portal_configuration_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE homehub_private.sandbox_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.sandbox_catalog FROM PUBLIC,anon,authenticated;
CREATE TABLE homehub_private.sandbox_customers (
 household_id uuid PRIMARY KEY REFERENCES public.households ON DELETE CASCADE,
 buyer_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE, customer_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE homehub_private.sandbox_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.sandbox_customers FROM PUBLIC,anon,authenticated;
CREATE TABLE homehub_private.sandbox_checkout_attempts (
 id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES public.households ON DELETE CASCADE,
 buyer_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE, interval text NOT NULL CHECK(interval IN('month','year')),
 plan_revision integer NOT NULL, monthly_amount integer NOT NULL, annual_amount integer NOT NULL, currency text NOT NULL,
 state text NOT NULL DEFAULT 'creating' CHECK(state IN('creating','open','completed','expired')),
 session_id text UNIQUE, session_url text, expires_at bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sandbox_attempt_household_idx ON homehub_private.sandbox_checkout_attempts(household_id,created_at);
ALTER TABLE homehub_private.sandbox_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.sandbox_checkout_attempts FROM PUBLIC,anon,authenticated;
CREATE TABLE homehub_private.sandbox_subscriptions (
 id text PRIMARY KEY, household_id uuid NOT NULL REFERENCES public.households ON DELETE CASCADE,
 customer_id text NOT NULL REFERENCES homehub_private.sandbox_customers(customer_id) ON DELETE CASCADE,
 status text NOT NULL, interval text NOT NULL, price_id text NOT NULL, amount integer NOT NULL, currency text NOT NULL,
 cancel_at_period_end boolean NOT NULL DEFAULT false, period_start bigint NOT NULL, period_end bigint NOT NULL,
 latest_invoice text, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sandbox_subscription_household_idx ON homehub_private.sandbox_subscriptions(household_id,updated_at);
ALTER TABLE homehub_private.sandbox_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.sandbox_subscriptions FROM PUBLIC,anon,authenticated;
CREATE TABLE homehub_private.sandbox_reconcile_leases(id text PRIMARY KEY, token uuid NOT NULL, expires_at timestamptz NOT NULL);
ALTER TABLE homehub_private.sandbox_reconcile_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.sandbox_reconcile_leases FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_business_legal() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.require_platform_admin();
 RETURN jsonb_build_object('profile',(SELECT to_jsonb(p)-'id' FROM homehub_private.legal_profile p WHERE id),
 'commercial_launch',false,'limits_enabled',(SELECT limits_enabled FROM homehub_private.business_rollout WHERE id),
 'privacy_requests',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY created_at DESC),'[]') FROM(SELECT id,user_id,kind,detail,status,resolution,created_at,updated_at FROM homehub_private.privacy_requests ORDER BY created_at DESC LIMIT 100)p));
END $$;
CREATE FUNCTION public.admin_save_business_legal(_profile jsonb,_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old homehub_private.legal_profile; k text; s text;
BEGIN
 PERFORM public.require_platform_admin();
 IF jsonb_typeof(_profile) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_profile) x WHERE x NOT IN('company_formed','operator_name','operator_state','operator_address','support_email','privacy_email','copyright_name','copyright_address','copyright_phone','copyright_email','dmca_registered','reviewed')) THEN RAISE EXCEPTION 'Invalid legal fields' USING ERRCODE='22023'; END IF;
 FOR k,s IN SELECT key,value#>>'{}' FROM jsonb_each(_profile) WHERE key NOT IN('company_formed','dmca_registered','reviewed') LOOP
  IF length(coalesce(s,''))>2000 THEN RAISE EXCEPTION 'Legal field too long' USING ERRCODE='22023'; END IF;
  IF k LIKE '%email' AND coalesce(s,'')<>'' AND (length(s)>254 OR s !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid legal email' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT * INTO old FROM homehub_private.legal_profile WHERE id FOR UPDATE;
 IF old.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'Legal profile changed' USING ERRCODE='40001'; END IF;
 UPDATE homehub_private.legal_profile SET company_formed=coalesce((_profile->>'company_formed')::boolean,false),
 operator_name=coalesce(_profile->>'operator_name',''),operator_state=coalesce(_profile->>'operator_state',''),operator_address=coalesce(_profile->>'operator_address',''),
 support_email=coalesce(_profile->>'support_email',''),privacy_email=coalesce(_profile->>'privacy_email',''),copyright_name=coalesce(_profile->>'copyright_name',''),
 copyright_address=coalesce(_profile->>'copyright_address',''),copyright_phone=coalesce(_profile->>'copyright_phone',''),copyright_email=coalesce(_profile->>'copyright_email',''),
 dmca_registered=coalesce((_profile->>'dmca_registered')::boolean,false),reviewed=coalesce((_profile->>'reviewed')::boolean,false),status='draft',revision=revision+1,updated_at=now() WHERE id;
 PERFORM homehub_private.audit('legal.draft','profile',jsonb_build_object('revision',old.revision+1));
 RETURN public.admin_business_legal();
END $$;
CREATE FUNCTION public.create_privacy_request(_kind text,_detail text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
 IF _kind NOT IN('access','correction','deletion') OR length(coalesce(_detail,''))>2000 THEN RAISE EXCEPTION 'Invalid privacy request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('privacy:'||auth.uid()::text,0));
 SELECT id INTO rid FROM homehub_private.privacy_requests WHERE user_id=auth.uid() AND kind=_kind AND status IN('received','reviewing') ORDER BY created_at DESC LIMIT 1;
 IF rid IS NOT NULL THEN RETURN rid; END IF;
 INSERT INTO homehub_private.privacy_requests(user_id,kind,detail) VALUES(auth.uid(),_kind,coalesce(_detail,'')) RETURNING id INTO rid;
 RETURN rid;
END $$;
CREATE FUNCTION public.my_privacy_requests() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Account required' USING ERRCODE='42501'; END IF;
 RETURN(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'status',status,'resolution',resolution,'created_at',created_at) ORDER BY created_at DESC),'[]') FROM homehub_private.privacy_requests WHERE user_id=auth.uid());
END $$;
CREATE FUNCTION public.admin_update_privacy_request(_id uuid,_status text,_resolution text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.require_platform_admin();
 IF _status NOT IN('reviewing','completed','declined') OR length(btrim(coalesce(_resolution,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Resolution required' USING ERRCODE='22023'; END IF;
 UPDATE homehub_private.privacy_requests SET status=_status,resolution=btrim(_resolution),updated_at=now() WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='22023'; END IF;
 PERFORM homehub_private.audit('privacy.updated',_id::text,jsonb_build_object('status',_status));
END $$;

CREATE OR REPLACE FUNCTION public.business_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('provider','stripe','country',coalesce((SELECT country FROM homehub_private.business_settings WHERE id),'US'),'automatic_billing',false,'commercial_launch',false,'billing_unit','household','minimum_age',13,'administrator_age',18,'limits_enabled',(SELECT limits_enabled FROM homehub_private.business_rollout WHERE id),
 'plans',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'amount_cents',amount_cents,'annual_amount_cents',annual_amount_cents,'currency',currency,'limits',limits) ORDER BY id) FROM homehub_private.business_plans))
$$;
CREATE OR REPLACE FUNCTION public.admin_save_business_plan(_plan jsonb,_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old homehub_private.business_plans; saved homehub_private.business_plans;
BEGIN
 PERFORM public.require_platform_admin();
 IF jsonb_typeof(_plan) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_plan) k WHERE k NOT IN('id','name','amount_cents','annual_amount_cents','currency','billing_interval','limits')) THEN RAISE EXCEPTION 'Invalid plan fields' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM homehub_private.business_plans WHERE id=_plan->>'id' FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Invalid plan' USING ERRCODE='22023'; END IF;
 IF old.revision IS DISTINCT FROM _expected_revision THEN
  IF old.revision=_expected_revision+1 AND to_jsonb(old)-'revision'=_plan||jsonb_build_object('limits',coalesce(_plan->'limits',old.limits)) THEN RETURN to_jsonb(old); END IF;
  RAISE EXCEPTION 'Plan changed' USING ERRCODE='40001';
 END IF;
 IF length(btrim(coalesce(_plan->>'name',''))) NOT BETWEEN 1 AND 80 OR coalesce(_plan->>'currency','') !~ '^[A-Z]{3}$' OR coalesce(_plan->>'billing_interval','') NOT IN('none','month','year') OR (_plan->>'amount_cents')::integer NOT BETWEEN 0 AND 100000000 OR (_plan->>'annual_amount_cents')::integer NOT BETWEEN 0 AND 100000000 OR (_plan?'limits' AND NOT homehub_private.valid_plan_limits(_plan->'limits')) THEN RAISE EXCEPTION 'Invalid plan' USING ERRCODE='22023'; END IF;
 UPDATE homehub_private.business_plans SET name=btrim(_plan->>'name'),amount_cents=(_plan->>'amount_cents')::integer,annual_amount_cents=(_plan->>'annual_amount_cents')::integer,currency=_plan->>'currency',billing_interval=_plan->>'billing_interval',limits=coalesce(_plan->'limits',old.limits),revision=revision+1 WHERE id=old.id RETURNING * INTO saved;
 PERFORM homehub_private.audit('business.plan',old.id,jsonb_build_object('revision',old.revision+1));
 RETURN to_jsonb(saved);
END $$;

CREATE FUNCTION homehub_private.require_sandbox_household() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
 SELECT household_id INTO hid FROM public.my_context() LIMIT 1;
 IF hid IS NULL OR NOT public.is_household_admin(hid) THEN RAISE EXCEPTION 'Household adult required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='platform_admin') AND NOT EXISTS(SELECT 1 FROM homehub_private.subscription_test_jobs WHERE user_id=auth.uid() AND household_id=hid AND state='ready' AND expires_at>now()) THEN RAISE EXCEPTION 'Sandbox testing is restricted to approved test accounts' USING ERRCODE='42501'; END IF;
 RETURN hid;
END $$;
REVOKE ALL ON FUNCTION homehub_private.require_sandbox_household() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.my_household_plan() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; p text; limits jsonb; s homehub_private.sandbox_subscriptions; c homehub_private.sandbox_customers; a homehub_private.sandbox_checkout_attempts; can_test boolean:=false;
BEGIN
 SELECT household_id INTO hid FROM public.my_context() LIMIT 1;
 IF hid IS NULL THEN RAISE EXCEPTION 'Household required' USING ERRCODE='42501'; END IF;
 SELECT h.plan INTO p FROM public.households h WHERE h.id=hid;
 SELECT b.limits INTO limits FROM homehub_private.business_plans b WHERE b.id=p;
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=hid;
 SELECT * INTO s FROM homehub_private.sandbox_subscriptions WHERE household_id=hid ORDER BY (status NOT IN('canceled','incomplete_expired')) DESC,period_start DESC,updated_at DESC LIMIT 1;
 SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE household_id=hid AND buyer_id=auth.uid() AND state IN('creating','open') AND expires_at>extract(epoch from now()) ORDER BY created_at DESC LIMIT 1;
 IF auth.uid() IS NOT NULL AND public.is_household_admin(hid) THEN
  can_test:=EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='platform_admin') OR EXISTS(SELECT 1 FROM homehub_private.subscription_test_jobs WHERE user_id=auth.uid() AND household_id=hid AND state='ready' AND expires_at>now());
 END IF;
 RETURN jsonb_build_object('plan',p,'limits',limits,'commercial_launch',false,'limits_enabled',(SELECT limits_enabled FROM homehub_private.business_rollout WHERE id),'billing_unit','household','can_test',can_test,
 'can_manage_subscription',can_test AND c.buyer_id=auth.uid(),
 'usage',jsonb_build_object('members',(SELECT count(*) FROM public.members WHERE household_id=hid),'lists',(SELECT count(*) FROM public.shopping_lists WHERE household_id=hid AND NOT archived),'devices',(SELECT count(*) FROM public.devices WHERE household_id=hid AND NOT revoked),'photos',(SELECT count(*) FROM public.household_photos WHERE household_id=hid)),
 'sandbox',CASE WHEN can_test AND s.id IS NOT NULL THEN jsonb_build_object('status',s.status,'interval',s.interval,'amount',s.amount,'currency',s.currency,'cancel_at_period_end',s.cancel_at_period_end,'period_end',s.period_end,'revision',s.revision,'simulated_plan',CASE WHEN s.status IN('active','trialing') THEN 'pro' ELSE 'free' END) ELSE NULL END,
 'pending_checkout',CASE WHEN can_test AND a.id IS NOT NULL THEN jsonb_build_object('request_id',a.id,'interval',a.interval) ELSE NULL END);
END $$;
CREATE FUNCTION public.prepare_sandbox_checkout(_gateway_key text,_request_id uuid,_interval text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; a homehub_private.sandbox_checkout_attempts; other homehub_private.sandbox_checkout_attempts; p homehub_private.business_plans; c homehub_private.sandbox_customers;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);hid:=homehub_private.require_sandbox_household();PERFORM homehub_private.lock_household(hid,true);
 IF _request_id IS NULL OR _interval NOT IN('month','year') OR _interval IS NULL THEN RAISE EXCEPTION 'Invalid subscription request' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=hid;
 IF c.buyer_id IS NOT NULL AND c.buyer_id<>auth.uid() THEN RAISE EXCEPTION 'Only the subscription buyer may manage billing' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM homehub_private.sandbox_subscriptions WHERE household_id=hid AND status NOT IN('canceled','incomplete_expired')) THEN RAISE EXCEPTION 'Manage the existing subscription through the portal' USING ERRCODE='23505'; END IF;
 SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE id=_request_id;
 IF a.id IS NOT NULL THEN
  IF a.buyer_id<>auth.uid() OR a.household_id<>hid THEN RAISE EXCEPTION 'Attempt belongs to another account' USING ERRCODE='42501'; END IF;
  IF a.interval<>_interval THEN RAISE EXCEPTION 'Request identity reused' USING ERRCODE='22023'; END IF;
  IF a.state IN('expired','completed') OR a.expires_at<=extract(epoch from now()) THEN RAISE EXCEPTION 'Start a new checkout attempt' USING ERRCODE='22023'; END IF;
 ELSE
  SELECT * INTO other FROM homehub_private.sandbox_checkout_attempts WHERE household_id=hid AND state IN('creating','open') AND expires_at>extract(epoch from now()) ORDER BY created_at DESC LIMIT 1;
  IF other.id IS NOT NULL THEN
   IF other.buyer_id<>auth.uid() OR other.interval<>_interval THEN RAISE EXCEPTION 'A checkout is already pending' USING ERRCODE='23505'; END IF;
   a:=other;
  ELSE
   SELECT * INTO p FROM homehub_private.business_plans WHERE id='pro';
   IF coalesce(p.amount_cents,0)<=0 OR coalesce(p.annual_amount_cents,0)<=0 THEN RAISE EXCEPTION 'Plan prices are not ready' USING ERRCODE='22023'; END IF;
   INSERT INTO homehub_private.sandbox_checkout_attempts(id,household_id,buyer_id,interval,plan_revision,monthly_amount,annual_amount,currency,expires_at)
   VALUES(_request_id,hid,auth.uid(),_interval,p.revision,p.amount_cents,p.annual_amount_cents,p.currency,floor(extract(epoch from now()))::bigint+3600) RETURNING * INTO a;
  END IF;
 END IF;
 RETURN to_jsonb(a)||jsonb_build_object('email',(SELECT email FROM auth.users WHERE id=auth.uid()),'customer_id',c.customer_id,'mode','sandbox');
END $$;
CREATE FUNCTION public.save_sandbox_customer(_gateway_key text,_attempt_id uuid,_customer_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; a homehub_private.sandbox_checkout_attempts; c homehub_private.sandbox_customers;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);hid:=homehub_private.require_sandbox_household();PERFORM homehub_private.lock_household(hid,true);
 SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE id=_attempt_id AND household_id=hid AND buyer_id=auth.uid();
 IF a.id IS NULL OR _customer_id !~ '^cus_[A-Za-z0-9]+$' OR _customer_id IS NULL THEN RAISE EXCEPTION 'Invalid sandbox customer binding' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=hid;
 IF c.customer_id IS NOT NULL AND(c.customer_id<>_customer_id OR c.buyer_id<>auth.uid()) THEN RAISE EXCEPTION 'Customer already bound' USING ERRCODE='40001'; END IF;
 INSERT INTO homehub_private.sandbox_customers(household_id,buyer_id,customer_id) VALUES(hid,auth.uid(),_customer_id) ON CONFLICT(household_id) DO NOTHING;
 UPDATE homehub_private.subscription_test_jobs SET provider_customer_id=_customer_id WHERE user_id=auth.uid() AND household_id=hid AND state='ready' AND(provider_customer_id IS NULL OR provider_customer_id=_customer_id);
END $$;
CREATE FUNCTION public.save_sandbox_checkout(_gateway_key text,_attempt_id uuid,_session_id text,_session_url text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);hid:=homehub_private.require_sandbox_household();PERFORM homehub_private.lock_household(hid,true);
 IF coalesce(_session_id,'') !~ '^cs_test_[A-Za-z0-9]+$' OR coalesce(_session_url,'') !~ '^https://checkout[.]stripe[.]com/' OR length(_session_url)>4000 THEN RAISE EXCEPTION 'Invalid checkout receipt' USING ERRCODE='22023'; END IF;
 UPDATE homehub_private.sandbox_checkout_attempts SET session_id=_session_id,session_url=_session_url,state='open' WHERE id=_attempt_id AND household_id=hid AND buyer_id=auth.uid() AND state IN('creating','open') AND(session_id IS NULL OR session_id=_session_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Checkout binding changed' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION public.sandbox_billing_control(_gateway_key text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; c homehub_private.sandbox_customers; s homehub_private.sandbox_subscriptions; a homehub_private.sandbox_checkout_attempts;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);hid:=homehub_private.require_sandbox_household();
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=hid AND buyer_id=auth.uid();
 SELECT * INTO s FROM homehub_private.sandbox_subscriptions WHERE household_id=hid AND customer_id=c.customer_id ORDER BY (status NOT IN('canceled','incomplete_expired')) DESC,period_start DESC,updated_at DESC LIMIT 1;
 SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE household_id=hid AND buyer_id=auth.uid() ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('household_id',hid,'buyer_id',auth.uid(),'customer_id',c.customer_id,'subscription_id',s.id,'session_id',a.session_id,'attempt_id',a.id,'mode','sandbox');
END $$;

CREATE FUNCTION homehub_private.audit(_action text,_target text,_details jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),_action,_target,_details)
$$;
REVOKE ALL ON FUNCTION homehub_private.audit(text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.sandbox_catalog_resources(_gateway_key text,_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 RETURN jsonb_build_object('product_id',(SELECT product_id FROM homehub_private.sandbox_catalog ORDER BY plan_revision DESC LIMIT 1),'catalog',(SELECT to_jsonb(c) FROM homehub_private.sandbox_catalog c WHERE plan_revision=coalesce(_revision,(SELECT max(plan_revision) FROM homehub_private.sandbox_catalog))));
END $$;
CREATE FUNCTION public.save_sandbox_catalog(_gateway_key text,_catalog jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old homehub_private.sandbox_catalog; rev integer;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 IF jsonb_typeof(_catalog) IS DISTINCT FROM 'object' OR coalesce(_catalog->>'product_id','') !~ '^prod_[A-Za-z0-9]+$' OR coalesce(_catalog->>'month_price_id','') !~ '^price_[A-Za-z0-9]+$' OR coalesce(_catalog->>'year_price_id','') !~ '^price_[A-Za-z0-9]+$' OR coalesce(_catalog->>'currency','') !~ '^[A-Z]{3}$' OR (_catalog->>'monthly_amount')::integer NOT BETWEEN 1 AND 100000000 OR (_catalog->>'annual_amount')::integer NOT BETWEEN 1 AND 100000000 THEN RAISE EXCEPTION 'Invalid sandbox catalogue' USING ERRCODE='22023'; END IF;
 rev:=(_catalog->>'plan_revision')::integer;
 IF rev IS NULL OR rev<1 THEN RAISE EXCEPTION 'Invalid plan revision' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sandbox-catalog:'||rev::text,0));
 SELECT * INTO old FROM homehub_private.sandbox_catalog WHERE plan_revision=rev;
 IF old.plan_revision IS NOT NULL THEN
  IF old.product_id<>_catalog->>'product_id' OR old.month_price_id<>_catalog->>'month_price_id' OR old.year_price_id<>_catalog->>'year_price_id' OR old.monthly_amount<>(_catalog->>'monthly_amount')::integer OR old.annual_amount<>(_catalog->>'annual_amount')::integer OR old.currency<>_catalog->>'currency' THEN RAISE EXCEPTION 'Immutable price snapshot changed' USING ERRCODE='40001'; END IF;
 ELSE
  INSERT INTO homehub_private.sandbox_catalog(plan_revision,product_id,month_price_id,year_price_id,monthly_amount,annual_amount,currency)
  VALUES(rev,_catalog->>'product_id',_catalog->>'month_price_id',_catalog->>'year_price_id',(_catalog->>'monthly_amount')::integer,(_catalog->>'annual_amount')::integer,_catalog->>'currency');
 END IF;
 IF _catalog?'portal_configuration_id' AND _catalog->>'portal_configuration_id' ~ '^bpc_[A-Za-z0-9]+$' THEN
  UPDATE homehub_private.sandbox_catalog SET portal_configuration_id=_catalog->>'portal_configuration_id' WHERE plan_revision=rev;
 END IF;
END $$;
CREATE FUNCTION public.claim_sandbox_reconciliation(_gateway_key text,_subscription_id text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lease homehub_private.sandbox_reconcile_leases; token uuid:=gen_random_uuid();
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 IF coalesce(_subscription_id,'') !~ '^sub_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid subscription' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sandbox-reconcile:'||_subscription_id,0));
 SELECT * INTO lease FROM homehub_private.sandbox_reconcile_leases WHERE id=_subscription_id;
 IF lease.expires_at>now() THEN RAISE EXCEPTION 'Reconciliation in progress' USING ERRCODE='55000'; END IF;
 INSERT INTO homehub_private.sandbox_reconcile_leases(id,token,expires_at) VALUES(_subscription_id,token,now()+interval '45 seconds') ON CONFLICT(id) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at;
 RETURN token;
END $$;
CREATE FUNCTION public.release_sandbox_reconciliation(_gateway_key text,_subscription_id text,_lease uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM homehub_private.require_billing_gateway(_gateway_key);DELETE FROM homehub_private.sandbox_reconcile_leases WHERE id=_subscription_id AND token=_lease;END $$;
CREATE FUNCTION public.capture_sandbox_subscription(_gateway_key text,_lease uuid,_snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a homehub_private.sandbox_checkout_attempts; c homehub_private.sandbox_customers; price homehub_private.sandbox_catalog; existing homehub_private.sandbox_subscriptions; hid uuid; price_id text; sub_id text; period_end bigint; period_start bigint; sub_status text;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 sub_id:=_snapshot->>'id';
 IF _snapshot->'livemode' IS DISTINCT FROM 'false'::jsonb OR coalesce(sub_id,'') !~ '^sub_[A-Za-z0-9]+$' OR NOT EXISTS(SELECT 1 FROM homehub_private.sandbox_reconcile_leases WHERE id=sub_id AND token=_lease AND expires_at>now()) THEN RAISE EXCEPTION 'Invalid reconciliation lease' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE id=(_snapshot->>'attempt_id')::uuid;
 IF a.id IS NULL THEN RETURN jsonb_build_object('ignored',true,'reason','unknown_attempt'); END IF;
 hid:=a.household_id;PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||hid::text,0));
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=hid;
 IF c.customer_id IS DISTINCT FROM _snapshot->>'customer_id' OR c.buyer_id<>a.buyer_id OR hid::text IS DISTINCT FROM _snapshot->>'household_id' THEN RAISE EXCEPTION 'Subscription household mismatch' USING ERRCODE='42501'; END IF;
 price_id:=_snapshot->>'price_id';
 SELECT * INTO price FROM homehub_private.sandbox_catalog WHERE price_id IN(month_price_id,year_price_id) ORDER BY plan_revision DESC LIMIT 1;
 IF price.plan_revision IS NULL OR _snapshot->>'currency' IS DISTINCT FROM price.currency OR _snapshot->>'amount' IS NULL OR _snapshot->>'price_id' IS NULL OR coalesce(_snapshot->>'interval','') NOT IN('month','year') OR (_snapshot->>'interval'='month' AND(price_id<>price.month_price_id OR (_snapshot->>'amount')::integer<>price.monthly_amount)) OR (_snapshot->>'interval'='year' AND(price_id<>price.year_price_id OR (_snapshot->>'amount')::integer<>price.annual_amount)) THEN RAISE EXCEPTION 'Unknown subscription price' USING ERRCODE='22023'; END IF;
 sub_status:=_snapshot->>'status';period_start:=(_snapshot->>'period_start')::bigint;period_end:=(_snapshot->>'period_end')::bigint;
 IF sub_status IS NULL OR sub_status NOT IN('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused') OR period_start IS NULL OR period_end IS NULL OR period_end<period_start THEN RAISE EXCEPTION 'Invalid subscription state' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM homehub_private.sandbox_subscriptions WHERE id=sub_id;
 IF existing.id IS NOT NULL AND(existing.household_id<>hid OR existing.customer_id<>c.customer_id) THEN RAISE EXCEPTION 'Subscription cannot move between households' USING ERRCODE='42501'; END IF;
 INSERT INTO homehub_private.sandbox_subscriptions(id,household_id,customer_id,status,interval,price_id,amount,currency,cancel_at_period_end,period_start,period_end,latest_invoice)
 VALUES(sub_id,hid,c.customer_id,sub_status,_snapshot->>'interval',price_id,(_snapshot->>'amount')::integer,price.currency,coalesce((_snapshot->>'cancel_at_period_end')::boolean,false),period_start,period_end,_snapshot->>'latest_invoice')
 ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,interval=EXCLUDED.interval,price_id=EXCLUDED.price_id,amount=EXCLUDED.amount,currency=EXCLUDED.currency,cancel_at_period_end=EXCLUDED.cancel_at_period_end,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,latest_invoice=EXCLUDED.latest_invoice,revision=homehub_private.sandbox_subscriptions.revision+1,updated_at=now()
 WHERE (homehub_private.sandbox_subscriptions.status,homehub_private.sandbox_subscriptions.interval,homehub_private.sandbox_subscriptions.price_id,homehub_private.sandbox_subscriptions.amount,homehub_private.sandbox_subscriptions.currency,homehub_private.sandbox_subscriptions.cancel_at_period_end,homehub_private.sandbox_subscriptions.period_start,homehub_private.sandbox_subscriptions.period_end,homehub_private.sandbox_subscriptions.latest_invoice)
 IS DISTINCT FROM (EXCLUDED.status,EXCLUDED.interval,EXCLUDED.price_id,EXCLUDED.amount,EXCLUDED.currency,EXCLUDED.cancel_at_period_end,EXCLUDED.period_start,EXCLUDED.period_end,EXCLUDED.latest_invoice);
 IF sub_status IN('active','trialing','past_due','canceled','unpaid') THEN UPDATE homehub_private.sandbox_checkout_attempts SET state='completed' WHERE id=a.id; END IF;
 -- Do not update public.households.plan or business_payments. This is sandbox.
 RETURN jsonb_build_object('received',true,'mode','sandbox','status',sub_status,'household_id',hid);
END $$;
CREATE FUNCTION public.expire_sandbox_checkout(_gateway_key text,_session_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM homehub_private.require_billing_gateway(_gateway_key);UPDATE homehub_private.sandbox_checkout_attempts SET state='expired' WHERE session_id=_session_id AND state IN('creating','open');END $$;

-- Owner-issued, expiring test capabilities. Public users cannot create a job.
CREATE FUNCTION homehub_private.valid_test_job(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM homehub_private.subscription_test_jobs j JOIN auth.users u ON u.id=j.requested_by JOIN public.user_roles r ON r.user_id=u.id AND r.role='platform_admin' WHERE j.id=_id AND j.expires_at>now() AND j.state<>'cleaned' AND u.email_confirmed_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION homehub_private.valid_test_job(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.claim_subscription_test_identity(_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs;
BEGIN
 IF length(coalesce(_token,''))<40 THEN RAISE EXCEPTION 'Invalid test capability' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE key_hash=encode(extensions.digest(_token,'sha256'),'hex') FOR UPDATE;
 IF j.id IS NULL OR NOT homehub_private.valid_test_job(j.id) OR j.state NOT IN('new','creating','ready') THEN RAISE EXCEPTION 'Test job unavailable' USING ERRCODE='42501'; END IF;
 UPDATE homehub_private.subscription_test_jobs SET state=CASE WHEN state='new' THEN 'creating' ELSE state END WHERE id=j.id;
 RETURN jsonb_build_object('id',j.id,'scenario',j.scenario,'email','qa-subs-'||j.id::text||'@example.invalid','user_id',j.user_id,'household_id',j.household_id,'state',j.state);
END $$;
CREATE FUNCTION public.finish_subscription_test_identity(_token text,_user_id uuid,_household_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs;
BEGIN
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE key_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex') FOR UPDATE;
 IF j.id IS NULL OR NOT homehub_private.valid_test_job(j.id) OR j.state NOT IN('creating','ready') OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user_id AND email='qa-subs-'||j.id::text||'@example.invalid') OR NOT EXISTS(SELECT 1 FROM public.household_accounts a JOIN public.households h ON h.id=a.household_id WHERE a.user_id=_user_id AND a.household_id=_household_id AND h.name='Skendal billing QA '||j.id::text) OR EXISTS(SELECT 1 FROM public.household_accounts WHERE household_id=_household_id AND user_id<>_user_id) THEN RAISE EXCEPTION 'Only the registered QA identity may be bound' USING ERRCODE='42501'; END IF;
 IF j.user_id IS NOT NULL AND(j.user_id<>_user_id OR j.household_id<>_household_id) THEN RAISE EXCEPTION 'QA identity already bound' USING ERRCODE='42501'; END IF;
 UPDATE homehub_private.subscription_test_jobs SET user_id=_user_id,household_id=_household_id,state='ready' WHERE id=j.id;
END $$;
CREATE FUNCTION public.subscription_test_operation(_gateway_key text,_token text,_action text,_value jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs; c homehub_private.sandbox_customers; s homehub_private.sandbox_subscriptions; cleanup boolean;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE key_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex') OR (_action='cleanup_provider' AND cleanup_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex')) FOR UPDATE;
 cleanup:=_action='cleanup_provider' AND j.cleanup_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex');
 IF length(coalesce(_token,''))<40 OR j.id IS NULL OR (NOT coalesce(cleanup,false) AND (NOT homehub_private.valid_test_job(j.id) OR j.state<>'ready')) THEN RAISE EXCEPTION 'Test job unavailable' USING ERRCODE='42501'; END IF;
 IF _action NOT IN('inspect','save_clock','set_success_payment','set_failure_payment','create_clock_subscription','advance_clock','finalize_clock','change_interval','cancel_at_period_end','resume','cancel_now','refund_latest','cleanup_provider') OR _action IS NULL THEN RAISE EXCEPTION 'Unsupported test action' USING ERRCODE='22023'; END IF;
 IF _action='save_clock' THEN
  IF coalesce(_value->>'clock_id','') !~ '^clock_[A-Za-z0-9]+$' OR(j.test_clock_id IS NOT NULL AND j.test_clock_id<>_value->>'clock_id') THEN RAISE EXCEPTION 'Invalid test clock binding' USING ERRCODE='22023'; END IF;
  UPDATE homehub_private.subscription_test_jobs SET test_clock_id=_value->>'clock_id' WHERE id=j.id;j.test_clock_id:=_value->>'clock_id';
 END IF;
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=j.household_id AND buyer_id=j.user_id;
 SELECT * INTO s FROM homehub_private.sandbox_subscriptions WHERE household_id=j.household_id ORDER BY (status NOT IN('canceled','incomplete_expired')) DESC,period_start DESC,updated_at DESC LIMIT 1;
 RETURN jsonb_build_object('job_id',j.id,'scenario',j.scenario,'user_id',j.user_id,'household_id',j.household_id,'test_clock_id',j.test_clock_id,'customer_id',coalesce(c.customer_id,j.provider_customer_id),'subscription_id',s.id,'latest_invoice',s.latest_invoice,'status',s.status,'period_end',s.period_end,'interval',s.interval,'mode','sandbox');
END $$;
CREATE FUNCTION public.prepare_clock_test_checkout(_gateway_key text,_token text,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs; a homehub_private.sandbox_checkout_attempts; p homehub_private.business_plans; c homehub_private.sandbox_customers; frequency text;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE key_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex');
 IF length(coalesce(_token,''))<40 OR j.id IS NULL OR NOT homehub_private.valid_test_job(j.id) OR j.state<>'ready' OR j.scenario NOT IN('clock-month','clock-year') OR _request_id IS NULL THEN RAISE EXCEPTION 'Clock scenario required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||j.household_id::text,0));
 frequency:=CASE j.scenario WHEN 'clock-month' THEN 'month' ELSE 'year' END;
 SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE id=_request_id;
 IF a.id IS NOT NULL AND(a.household_id<>j.household_id OR a.buyer_id<>j.user_id OR a.interval<>frequency) THEN RAISE EXCEPTION 'Test attempt mismatch' USING ERRCODE='42501'; END IF;
 IF a.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM homehub_private.sandbox_checkout_attempts WHERE household_id=j.household_id) THEN SELECT * INTO a FROM homehub_private.sandbox_checkout_attempts WHERE household_id=j.household_id ORDER BY created_at LIMIT 1;
  ELSE
   SELECT * INTO p FROM homehub_private.business_plans WHERE id='pro';
   INSERT INTO homehub_private.sandbox_checkout_attempts(id,household_id,buyer_id,interval,plan_revision,monthly_amount,annual_amount,currency,expires_at)
   VALUES(_request_id,j.household_id,j.user_id,frequency,p.revision,p.amount_cents,p.annual_amount_cents,p.currency,floor(extract(epoch from now()))::bigint+3600) RETURNING * INTO a;
  END IF;
 END IF;
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=j.household_id;
 RETURN to_jsonb(a)||jsonb_build_object('email','qa-subs-'||j.id::text||'@example.invalid','customer_id',c.customer_id,'test_clock_id',j.test_clock_id,'mode','sandbox');
END $$;
CREATE FUNCTION public.save_clock_test_customer(_gateway_key text,_token text,_customer_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs; c homehub_private.sandbox_customers;
BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE key_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex');
 IF j.id IS NULL OR NOT homehub_private.valid_test_job(j.id) OR j.state<>'ready' OR j.scenario NOT IN('clock-month','clock-year') OR _customer_id IS NULL OR _customer_id !~ '^cus_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid clock customer' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||j.household_id::text,0));
 SELECT * INTO c FROM homehub_private.sandbox_customers WHERE household_id=j.household_id;
 IF c.customer_id IS NOT NULL AND(c.customer_id<>_customer_id OR c.buyer_id<>j.user_id) THEN RAISE EXCEPTION 'Customer already bound' USING ERRCODE='40001'; END IF;
 INSERT INTO homehub_private.sandbox_customers(household_id,buyer_id,customer_id) VALUES(j.household_id,j.user_id,_customer_id) ON CONFLICT(household_id) DO NOTHING;
 UPDATE homehub_private.subscription_test_jobs SET provider_customer_id=_customer_id WHERE id=j.id;
END $$;
CREATE FUNCTION public.cleanup_subscription_test_identity(_job_id uuid,_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs;
BEGIN
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE id=_job_id AND cleanup_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex') FOR UPDATE;
 IF length(coalesce(_token,''))<40 OR j.id IS NULL OR j.state='new' THEN RAISE EXCEPTION 'Cleanup capability required' USING ERRCODE='42501'; END IF;
 -- Cleanup remains possible after the test TTL, but only for this exact identity.
 IF j.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=j.user_id AND email='qa-subs-'||j.id::text||'@example.invalid') THEN RAISE EXCEPTION 'QA identity mismatch' USING ERRCODE='42501'; END IF;
 IF j.household_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.households WHERE id=j.household_id AND name='Skendal billing QA '||j.id::text) OR EXISTS(SELECT 1 FROM public.household_accounts WHERE household_id=j.household_id AND user_id IS DISTINCT FROM j.user_id)) THEN RAISE EXCEPTION 'Household is not an isolated test' USING ERRCODE='42501'; END IF;
 UPDATE homehub_private.subscription_test_jobs SET state='cleaning',cleanup_started_at=now() WHERE id=j.id AND state<>'cleaned';
 RETURN jsonb_build_object('id',j.id,'user_id',j.user_id,'household_id',j.household_id,'state',j.state);
END $$;
CREATE FUNCTION public.finish_subscription_test_cleanup(_job_id uuid,_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j homehub_private.subscription_test_jobs;
BEGIN
 SELECT * INTO j FROM homehub_private.subscription_test_jobs WHERE id=_job_id AND cleanup_hash=encode(extensions.digest(coalesce(_token,''),'sha256'),'hex') FOR UPDATE;
 IF length(coalesce(_token,''))<40 OR j.id IS NULL OR j.state NOT IN('cleaning','cleaned') OR(j.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users WHERE id=j.user_id)) THEN RAISE EXCEPTION 'Delete only the registered QA identity first' USING ERRCODE='42501'; END IF;
 IF j.household_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.household_accounts WHERE household_id=j.household_id) OR NOT EXISTS(SELECT 1 FROM public.households WHERE id=j.household_id AND name='Skendal billing QA '||j.id::text) THEN RAISE EXCEPTION 'Unsafe QA household cleanup' USING ERRCODE='42501'; END IF;
  DELETE FROM public.households WHERE id=j.household_id;
 END IF;
 UPDATE homehub_private.subscription_test_jobs SET state='cleaned',user_id=NULL,household_id=NULL WHERE id=j.id;
END $$;

-- Optional, server-side capacity checks. Disabled for the current private beta.
CREATE FUNCTION homehub_private.check_plan_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hid uuid; limits jsonb; quantity bigint; cap integer; key text;
BEGIN
 IF NOT coalesce((SELECT limits_enabled FROM homehub_private.business_rollout WHERE id),false) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='dashboard_preferences' THEN
  IF auth.uid() IS NOT NULL AND NEW.user_id<>auth.uid() THEN RAISE EXCEPTION 'Own preferences required' USING ERRCODE='42501'; END IF;
  SELECT household_id INTO hid FROM public.household_accounts WHERE user_id=NEW.user_id ORDER BY created_at LIMIT 1;
 ELSE hid:=NEW.household_id; END IF;
 IF hid IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('homehub:'||hid::text,0));
 SELECT p.limits INTO limits FROM public.households h JOIN homehub_private.business_plans p ON p.id=h.plan WHERE h.id=hid;
 CASE TG_TABLE_NAME
 WHEN 'members' THEN key:='members';SELECT count(*) INTO quantity FROM public.members WHERE household_id=hid;
 WHEN 'shopping_lists' THEN
  IF NEW.archived OR(TG_OP='UPDATE' AND NOT OLD.archived) THEN RETURN NEW; END IF;
  key:='lists';SELECT count(*) INTO quantity FROM public.shopping_lists WHERE household_id=hid AND NOT archived;
 WHEN 'devices' THEN
  IF NEW.revoked OR(TG_OP='UPDATE' AND NOT OLD.revoked) THEN RETURN NEW; END IF;
  key:='devices';SELECT count(*) INTO quantity FROM public.devices WHERE household_id=hid AND NOT revoked;
 WHEN 'household_photos' THEN key:='photos';SELECT count(*) INTO quantity FROM public.household_photos WHERE household_id=hid;
 WHEN 'dashboard_preferences' THEN
  key:='widgets';quantity:=jsonb_array_length(NEW.layout->'widgets')-1;
  IF TG_OP='UPDATE' AND jsonb_array_length(NEW.layout->'widgets')<=jsonb_array_length(OLD.layout->'widgets') THEN RETURN NEW; END IF;
 ELSE RAISE EXCEPTION 'Unsupported quota';
 END CASE;
 cap:=(limits->>key)::integer;
 IF cap IS NULL OR quantity>=cap THEN RAISE EXCEPTION 'Plan capacity reached: %',key USING ERRCODE='54000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION homehub_private.check_plan_capacity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER plan_member_capacity BEFORE INSERT ON public.members FOR EACH ROW EXECUTE FUNCTION homehub_private.check_plan_capacity();
CREATE TRIGGER plan_list_capacity BEFORE INSERT OR UPDATE OF archived ON public.shopping_lists FOR EACH ROW EXECUTE FUNCTION homehub_private.check_plan_capacity();
CREATE TRIGGER plan_device_capacity BEFORE INSERT OR UPDATE OF revoked ON public.devices FOR EACH ROW EXECUTE FUNCTION homehub_private.check_plan_capacity();
CREATE TRIGGER plan_photo_capacity BEFORE INSERT ON public.household_photos FOR EACH ROW EXECUTE FUNCTION homehub_private.check_plan_capacity();
CREATE TRIGGER plan_widget_capacity BEFORE INSERT OR UPDATE OF layout ON public.dashboard_preferences FOR EACH ROW EXECUTE FUNCTION homehub_private.check_plan_capacity();

REVOKE ALL ON FUNCTION public.admin_business_legal(),public.admin_save_business_legal(jsonb,integer),public.create_privacy_request(text,text),public.my_privacy_requests(),public.admin_update_privacy_request(uuid,text,text),public.my_household_plan(),public.prepare_sandbox_checkout(text,uuid,text),public.save_sandbox_customer(text,uuid,text),public.save_sandbox_checkout(text,uuid,text,text),public.sandbox_billing_control(text),public.sandbox_catalog_resources(text,integer),public.save_sandbox_catalog(text,jsonb),public.claim_sandbox_reconciliation(text,text),public.release_sandbox_reconciliation(text,text,uuid),public.capture_sandbox_subscription(text,uuid,jsonb),public.expire_sandbox_checkout(text,text),public.claim_subscription_test_identity(text),public.finish_subscription_test_identity(text,uuid,uuid),public.subscription_test_operation(text,text,text,jsonb),public.prepare_clock_test_checkout(text,text,uuid),public.save_clock_test_customer(text,text,text),public.cleanup_subscription_test_identity(uuid,text),public.finish_subscription_test_cleanup(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_business_legal(),public.admin_save_business_legal(jsonb,integer),public.create_privacy_request(text,text),public.my_privacy_requests(),public.admin_update_privacy_request(uuid,text,text),public.prepare_sandbox_checkout(text,uuid,text),public.save_sandbox_customer(text,uuid,text),public.save_sandbox_checkout(text,uuid,text,text),public.sandbox_billing_control(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_household_plan() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sandbox_catalog_resources(text,integer),public.save_sandbox_catalog(text,jsonb),public.claim_sandbox_reconciliation(text,text),public.release_sandbox_reconciliation(text,text,uuid),public.capture_sandbox_subscription(text,uuid,jsonb),public.expire_sandbox_checkout(text,text),public.subscription_test_operation(text,text,text,jsonb),public.prepare_clock_test_checkout(text,text,uuid),public.save_clock_test_customer(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_subscription_test_identity(text),public.finish_subscription_test_identity(text,uuid,uuid),public.cleanup_subscription_test_identity(uuid,text),public.finish_subscription_test_cleanup(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
