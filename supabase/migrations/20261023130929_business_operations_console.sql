BEGIN;
-- Business operations have no household-context dependency and contain no family
-- finance records. Only verified platform administrators may use the RPCs below.
CREATE TABLE homehub_private.business_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 business_name text CHECK(length(btrim(business_name)) BETWEEN 1 AND 100),
 country text CHECK(country ~ '^[A-Z]{2}$'),
 currency text CHECK(currency ~ '^[A-Z]{3}$'),
 support_email text CHECK(length(support_email)<=254 AND support_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO homehub_private.business_settings(id,country,currency) VALUES(true,'US','USD');
CREATE TABLE homehub_private.business_plans (
 id text PRIMARY KEY CHECK(id IN('free','pro')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
 amount_cents integer CHECK(amount_cents BETWEEN 0 AND 100000000),
 annual_amount_cents integer CHECK(annual_amount_cents BETWEEN 0 AND 100000000),
 currency text CHECK(currency ~ '^[A-Z]{3}$'),
 billing_interval text NOT NULL DEFAULT 'month' CHECK(billing_interval IN('month','year','none')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK((amount_cents IS NULL AND annual_amount_cents IS NULL) OR currency IS NOT NULL)
);
INSERT INTO homehub_private.business_plans(id,name,amount_cents,annual_amount_cents,currency,billing_interval) VALUES('free','HomeHub',0,0,'USD','none'),('pro','Family Pro',299,599,'USD','month');
CREATE TABLE homehub_private.business_payments (
 id uuid PRIMARY KEY,
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 household_id uuid REFERENCES public.households ON DELETE SET NULL,
 household_label text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','received','canceled')),
 source text NOT NULL DEFAULT 'manual' CHECK(source='manual'),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=150),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 created_by uuid REFERENCES auth.users ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK(status<>'received' OR length(btrim(reference))>0)
);
CREATE INDEX business_payments_household ON homehub_private.business_payments(household_id);
CREATE INDEX business_payments_status_currency ON homehub_private.business_payments(status,currency);
CREATE TABLE homehub_private.platform_audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid REFERENCES auth.users ON DELETE SET NULL,
 action text NOT NULL,
 target_id text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE homehub_private.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE homehub_private.business_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE homehub_private.business_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homehub_private.platform_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.business_settings,homehub_private.business_plans,homehub_private.business_payments,homehub_private.platform_audit FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.require_platform_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.am_platform_admin() OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.require_platform_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.require_platform_admin() TO authenticated;

-- A separate, minimal catalogue is safe to show on the public website.
CREATE FUNCTION public.business_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('provider','stripe','country','US','automatic_billing',false,
 'plans',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'amount_cents',amount_cents,'annual_amount_cents',annual_amount_cents,'currency',currency) ORDER BY id) FROM homehub_private.business_plans))
$$;
REVOKE ALL ON FUNCTION public.business_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_catalog() TO anon,authenticated;

CREATE FUNCTION public.admin_business_page(_section text,_before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb; BEGIN
 PERFORM public.require_platform_admin();
 IF _section='payments' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.sequence DESC),'[]') INTO result
  FROM(SELECT * FROM homehub_private.business_payments WHERE _before IS NULL OR sequence<_before ORDER BY sequence DESC LIMIT 50) p;
 ELSIF _section='audit' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.sequence DESC),'[]') INTO result
  FROM(SELECT a.*,u.email AS actor_email FROM homehub_private.platform_audit a LEFT JOIN auth.users u ON u.id=a.actor_id WHERE _before IS NULL OR a.sequence<_before ORDER BY a.sequence DESC LIMIT 50) a;
 ELSE RAISE EXCEPTION 'Invalid business section' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.admin_business_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb; BEGIN
 PERFORM public.require_platform_admin();
 SELECT jsonb_build_object(
  'settings',(SELECT to_jsonb(s)-'id' FROM homehub_private.business_settings s WHERE id),
  'plans',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM homehub_private.business_plans p),
  'payments',public.admin_business_page('payments'),
  'audit',public.admin_business_page('audit'),
  'totals',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM(SELECT currency,status,count(*) AS count,sum(amount_cents) AS amount_cents FROM homehub_private.business_payments GROUP BY currency,status ORDER BY currency,status) t),
  'unconfirmed_accounts',(SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL),
  'recent_accounts',(SELECT count(*) FROM auth.users WHERE last_sign_in_at>now()-interval '30 days'),
  'can_delegate',EXISTS(SELECT 1 FROM auth.users u JOIN homehub_private.platform_owners o ON o.email=lower(u.email) WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL),
  'automatic_billing',false
 ) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.admin_save_business_settings(_settings jsonb,_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE old homehub_private.business_settings; saved homehub_private.business_settings; BEGIN
 PERFORM public.require_platform_admin();
 IF jsonb_typeof(_settings) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_settings) k WHERE k NOT IN('business_name','country','currency','support_email')) THEN RAISE EXCEPTION 'Invalid business fields' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM homehub_private.business_settings WHERE id FOR UPDATE;
 IF old.revision<>_expected_revision OR _expected_revision IS NULL THEN
  IF old.revision=_expected_revision+1 AND to_jsonb(old)-'id'-'revision'-'updated_at'=_settings THEN RETURN to_jsonb(old)-'id'; END IF;
  RAISE EXCEPTION 'Business settings changed' USING ERRCODE='40001';
 END IF;
 UPDATE homehub_private.business_settings SET business_name=_settings->>'business_name',country=_settings->>'country',currency=_settings->>'currency',support_email=_settings->>'support_email',revision=revision+1,updated_at=now() WHERE id RETURNING * INTO saved;
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),'business.settings','settings',jsonb_build_object('revision',saved.revision));
 RETURN to_jsonb(saved)-'id';
END $$;
CREATE FUNCTION public.admin_save_business_plan(_plan jsonb,_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE old homehub_private.business_plans; saved homehub_private.business_plans; BEGIN
 PERFORM public.require_platform_admin();
 IF jsonb_typeof(_plan) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_plan) k WHERE k NOT IN('id','name','amount_cents','annual_amount_cents','currency','billing_interval')) THEN RAISE EXCEPTION 'Invalid plan fields' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM homehub_private.business_plans WHERE id=_plan->>'id' FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Invalid plan' USING ERRCODE='22023'; END IF;
 IF old.revision<>_expected_revision OR _expected_revision IS NULL THEN
  IF old.revision=_expected_revision+1 AND to_jsonb(old)-'revision'=_plan THEN RETURN to_jsonb(old); END IF;
  RAISE EXCEPTION 'Plan changed' USING ERRCODE='40001';
 END IF;
 UPDATE homehub_private.business_plans SET name=_plan->>'name',amount_cents=(_plan->>'amount_cents')::integer,annual_amount_cents=(_plan->>'annual_amount_cents')::integer,currency=_plan->>'currency',billing_interval=_plan->>'billing_interval',revision=revision+1 WHERE id=old.id RETURNING * INTO saved;
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),'business.plan',saved.id,jsonb_build_object('revision',saved.revision));
 RETURN to_jsonb(saved);
END $$;

CREATE FUNCTION public.admin_create_business_payment(_id uuid,_household uuid,_amount_cents integer,_currency text,_reference text DEFAULT '',_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE saved homehub_private.business_payments; label text; BEGIN
 PERFORM public.require_platform_admin();
 IF _id IS NULL OR _household IS NULL THEN RAISE EXCEPTION 'Payment identity and household required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('business-payment:'||_id::text,0));
 SELECT * INTO saved FROM homehub_private.business_payments WHERE id=_id;
 IF saved.id IS NOT NULL THEN
  IF saved.household_id=_household AND saved.amount_cents=_amount_cents AND saved.currency=upper(_currency) AND saved.reference=coalesce(_reference,'') AND saved.note=coalesce(_note,'') AND saved.created_by=auth.uid() THEN RETURN to_jsonb(saved); END IF;
  RAISE EXCEPTION 'Payment identity reused' USING ERRCODE='40001';
 END IF;
 SELECT name INTO label FROM public.households WHERE id=_household;
 IF label IS NULL THEN RAISE EXCEPTION 'Household not found' USING ERRCODE='22023'; END IF;
 INSERT INTO homehub_private.business_payments(id,household_id,household_label,amount_cents,currency,reference,note,created_by)
 VALUES(_id,_household,label,_amount_cents,upper(_currency),coalesce(_reference,''),coalesce(_note,''),auth.uid()) RETURNING * INTO saved;
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),'payment.created',_id::text,jsonb_build_object('household_id',_household,'amount_cents',_amount_cents,'currency',upper(_currency)));
 RETURN to_jsonb(saved);
END $$;
CREATE FUNCTION public.admin_update_business_payment(_id uuid,_expected_revision integer,_status text,_reference text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE old homehub_private.business_payments; saved homehub_private.business_payments; BEGIN
 PERFORM public.require_platform_admin();
 SELECT * INTO old FROM homehub_private.business_payments WHERE id=_id FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE='22023'; END IF;
 IF old.revision<>_expected_revision OR _expected_revision IS NULL THEN
  IF old.revision=_expected_revision+1 AND old.status=_status AND old.reference=btrim(_reference) THEN RETURN to_jsonb(old); END IF;
  RAISE EXCEPTION 'Payment changed' USING ERRCODE='40001';
 END IF;
 IF old.status<>'pending' OR _status IS NULL OR _status NOT IN('received','canceled') THEN RAISE EXCEPTION 'Invalid payment transition' USING ERRCODE='22023'; END IF;
 UPDATE homehub_private.business_payments SET status=_status,reference=btrim(coalesce(_reference,'')),revision=revision+1,updated_at=now() WHERE id=_id RETURNING * INTO saved;
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),'payment.'||_status,_id::text,jsonb_build_object('source','manual','reference',saved.reference));
 RETURN to_jsonb(saved);
END $$;

-- Existing service operations now leave an append-only audit trail. The role is
-- independent from household adults; only an allowlisted owner delegates it.
CREATE OR REPLACE FUNCTION public.admin_set_household(_id uuid,_plan text,_suspended boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE old public.households; BEGIN
 PERFORM public.require_platform_admin();
 IF _plan IS NULL OR _plan NOT IN('free','pro') OR _suspended IS NULL THEN RAISE EXCEPTION 'Invalid plan or state' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM public.households WHERE id=_id FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Household not found'; END IF;
 IF old.plan=_plan AND old.suspended=_suspended THEN RETURN; END IF;
 UPDATE public.households SET plan=_plan,suspended=_suspended WHERE id=_id;
 INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),'household.updated',_id::text,jsonb_build_object('before',jsonb_build_object('plan',old.plan,'suspended',old.suspended),'after',jsonb_build_object('plan',_plan,'suspended',_suspended)));
END $$;
CREATE OR REPLACE FUNCTION public.admin_revoke_household_devices(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE affected integer; BEGIN
 PERFORM public.require_platform_admin();
 UPDATE public.devices SET revoked=true WHERE household_id=_id AND NOT revoked;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected>0 THEN INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),'devices.revoked',_id::text,jsonb_build_object('count',affected)); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.admin_set_platform_admin(_user uuid,_grant boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM public.require_platform_admin();
 IF _grant IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN homehub_private.platform_owners o ON o.email=lower(u.email) WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Only the verified platform owner can delegate administration' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='22023'; END IF;
 IF _grant THEN INSERT INTO public.user_roles(user_id,role) VALUES(_user,'platform_admin') ON CONFLICT DO NOTHING;
 ELSE
  IF _user=auth.uid() OR EXISTS(SELECT 1 FROM auth.users u JOIN homehub_private.platform_owners o ON o.email=lower(u.email) WHERE u.id=_user) THEN RAISE EXCEPTION 'Cannot remove a platform owner'; END IF;
  DELETE FROM public.user_roles WHERE user_id=_user AND role='platform_admin';
 END IF;
 IF FOUND THEN INSERT INTO homehub_private.platform_audit(actor_id,action,target_id,details) VALUES(auth.uid(),CASE WHEN _grant THEN 'admin.granted' ELSE 'admin.revoked' END,_user::text,'{}'); END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_business_overview(),public.admin_business_page(text,bigint),public.admin_save_business_settings(jsonb,integer),public.admin_save_business_plan(jsonb,integer),public.admin_create_business_payment(uuid,uuid,integer,text,text,text),public.admin_update_business_payment(uuid,integer,text,text),public.admin_set_household(uuid,text,boolean),public.admin_revoke_household_devices(uuid),public.admin_set_platform_admin(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_business_overview(),public.admin_business_page(text,bigint),public.admin_save_business_settings(jsonb,integer),public.admin_save_business_plan(jsonb,integer),public.admin_create_business_payment(uuid,uuid,integer,text,text,text),public.admin_update_business_payment(uuid,integer,text,text),public.admin_set_household(uuid,text,boolean),public.admin_revoke_household_devices(uuid),public.admin_set_platform_admin(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
