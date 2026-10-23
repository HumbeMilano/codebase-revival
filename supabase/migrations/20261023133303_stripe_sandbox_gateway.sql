BEGIN;
-- Sandbox events never enable a paid household or contribute to real revenue.
CREATE TABLE homehub_private.billing_gateway_keys(id boolean PRIMARY KEY DEFAULT true CHECK(id),key_hash text NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'));
CREATE TABLE homehub_private.stripe_sandbox_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),account_id text NOT NULL,webhook_id text NOT NULL,webhook_secret text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE homehub_private.stripe_sandbox_events(event_id text PRIMARY KEY,event_type text NOT NULL,object_id text NOT NULL,summary jsonb NOT NULL,event_created bigint NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE homehub_private.billing_gateway_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE homehub_private.stripe_sandbox_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE homehub_private.stripe_sandbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homehub_private.billing_gateway_keys,homehub_private.stripe_sandbox_settings,homehub_private.stripe_sandbox_events FROM PUBLIC,anon,authenticated;
CREATE FUNCTION homehub_private.require_billing_gateway(_key text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF length(coalesce(_key,''))<40 OR NOT EXISTS(SELECT 1 FROM homehub_private.billing_gateway_keys WHERE id AND key_hash=encode(extensions.digest(_key,'sha256'),'hex')) THEN RAISE EXCEPTION 'Forbidden billing gateway' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION homehub_private.require_billing_gateway(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.stripe_sandbox_configuration(_gateway_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 RETURN(SELECT to_jsonb(s)-'id' FROM homehub_private.stripe_sandbox_settings s WHERE id);
END $$;
CREATE FUNCTION public.configure_stripe_sandbox(_gateway_key text,_account_id text,_webhook_id text,_webhook_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE old homehub_private.stripe_sandbox_settings; BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 IF _account_id IS NULL OR _account_id !~ '^acct_[a-zA-Z0-9]+$' OR _webhook_id IS NULL OR _webhook_id !~ '^we_[a-zA-Z0-9]+$' OR _webhook_secret IS NULL OR _webhook_secret !~ '^whsec_[a-zA-Z0-9]+$' THEN RAISE EXCEPTION 'Invalid sandbox configuration' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stripe-sandbox-setup',0));
 SELECT * INTO old FROM homehub_private.stripe_sandbox_settings WHERE id;
 IF old.id IS NOT NULL THEN
  IF old.account_id<>_account_id OR old.webhook_id<>_webhook_id OR old.webhook_secret<>_webhook_secret THEN RAISE EXCEPTION 'Sandbox already configured' USING ERRCODE='40001'; END IF;
 ELSE
  INSERT INTO homehub_private.stripe_sandbox_settings(id,account_id,webhook_id,webhook_secret) VALUES(true,_account_id,_webhook_id,_webhook_secret);
 END IF;
 RETURN jsonb_build_object('account_id',_account_id,'webhook_id',_webhook_id,'configured',true,'mode','sandbox');
END $$;
CREATE FUNCTION public.record_stripe_sandbox_event(_gateway_key text,_event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE obj jsonb; metadata jsonb; summary jsonb; affected integer; BEGIN
 PERFORM homehub_private.require_billing_gateway(_gateway_key);
 IF _event->'livemode' IS DISTINCT FROM 'false'::jsonb OR coalesce(_event->>'id','') !~ '^evt_[a-zA-Z0-9]+$' OR coalesce(_event->>'type','') NOT IN('checkout.session.completed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed') THEN RAISE EXCEPTION 'Only supported sandbox events are accepted' USING ERRCODE='22023'; END IF;
 obj:=_event#>'{data,object}';
 metadata:=coalesce(obj->'metadata','{}')||coalesce(obj#>'{parent,subscription_details,metadata}','{}');
 IF metadata->>'application' IS DISTINCT FROM 'homehub' OR metadata->>'environment' IS DISTINCT FROM 'sandbox' THEN RETURN jsonb_build_object('ignored',true); END IF;
 IF length(coalesce(obj->>'id','')) NOT BETWEEN 1 AND 150 OR (_event->>'created')::bigint IS NULL THEN RAISE EXCEPTION 'Invalid sandbox event' USING ERRCODE='22023'; END IF;
 summary:=jsonb_strip_nulls(jsonb_build_object('status',obj->>'status','payment_status',obj->>'payment_status','amount_total',obj->'amount_total','amount_paid',obj->'amount_paid','currency',obj->>'currency','customer_id',obj->>'customer','subscription_id',coalesce(obj->>'subscription',obj#>>'{parent,subscription_details,subscription}')));
 INSERT INTO homehub_private.stripe_sandbox_events(event_id,event_type,object_id,summary,event_created)
 VALUES(_event->>'id',_event->>'type',obj->>'id',summary,(_event->>'created')::bigint) ON CONFLICT(event_id) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN jsonb_build_object('received',true,'duplicate',affected=0,'mode','sandbox');
END $$;
CREATE FUNCTION public.admin_stripe_sandbox_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM public.require_platform_admin();
 RETURN jsonb_build_object('configured',EXISTS(SELECT 1 FROM homehub_private.stripe_sandbox_settings WHERE id),'account_id',(SELECT account_id FROM homehub_private.stripe_sandbox_settings WHERE id),'webhook_id',(SELECT webhook_id FROM homehub_private.stripe_sandbox_settings WHERE id),'mode','sandbox','automatic_billing',false,'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY received_at DESC),'[]') FROM(SELECT * FROM homehub_private.stripe_sandbox_events ORDER BY received_at DESC,event_id DESC LIMIT 50) e));
END $$;
REVOKE ALL ON FUNCTION public.stripe_sandbox_configuration(text),public.configure_stripe_sandbox(text,text,text,text),public.record_stripe_sandbox_event(text,jsonb),public.admin_stripe_sandbox_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_sandbox_configuration(text),public.configure_stripe_sandbox(text,text,text,text),public.record_stripe_sandbox_event(text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_stripe_sandbox_status() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
