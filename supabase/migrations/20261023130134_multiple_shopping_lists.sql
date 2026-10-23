BEGIN;
CREATE TABLE public.shopping_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 household_id uuid NOT NULL REFERENCES public.households ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
 archived boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,household_id),
 CHECK(id<>household_id OR NOT archived)
);
CREATE UNIQUE INDEX shopping_lists_household_name ON public.shopping_lists(household_id,lower(btrim(name)));
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shopping_lists FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.shopping_lists TO anon,authenticated;
GRANT ALL ON public.shopping_lists TO service_role;
CREATE POLICY shopping_lists_read ON public.shopping_lists FOR SELECT TO anon,authenticated
 USING(household_id IN(SELECT public.current_household_ids()));
INSERT INTO public.shopping_lists(id,household_id,name) SELECT id,id,'Groceries' FROM public.households;
CREATE FUNCTION homehub_private.default_shopping_list() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 INSERT INTO public.shopping_lists(id,household_id,name) VALUES(NEW.id,NEW.id,'Groceries'); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION homehub_private.default_shopping_list() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER default_shopping_list AFTER INSERT ON public.households FOR EACH ROW EXECUTE FUNCTION homehub_private.default_shopping_list();
ALTER TABLE public.shopping_items ADD COLUMN list_id uuid;
UPDATE public.shopping_items SET list_id=household_id;
ALTER TABLE public.shopping_items ALTER COLUMN list_id SET NOT NULL;
ALTER TABLE public.shopping_items ADD CONSTRAINT shopping_items_list_household_fk
 FOREIGN KEY(list_id,household_id) REFERENCES public.shopping_lists(id,household_id) ON DELETE CASCADE;
DROP INDEX public.shopping_household_product_unique;
CREATE UNIQUE INDEX shopping_list_product_unique ON public.shopping_items(list_id,lower(btrim(name)));
CREATE INDEX shopping_items_list_order ON public.shopping_items(list_id,position,id);
CREATE FUNCTION homehub_private.check_shopping_list() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 -- Legacy clients and their already-persisted outboxes target the original list.
 NEW.list_id:=coalesce(NEW.list_id,NEW.household_id);
 IF NOT EXISTS(SELECT 1 FROM public.shopping_lists l WHERE l.id=NEW.list_id AND l.household_id=NEW.household_id AND NOT l.archived) THEN
  RAISE EXCEPTION 'Shopping list changed or archived; review your changes' USING ERRCODE='40001';
 END IF;
 IF TG_OP='INSERT' AND (SELECT count(*) FROM public.shopping_items WHERE list_id=NEW.list_id)>=1000 THEN
  RAISE EXCEPTION 'Shopping list limit reached' USING ERRCODE='54000';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION homehub_private.check_shopping_list() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER check_shopping_list BEFORE INSERT OR UPDATE ON public.shopping_items FOR EACH ROW EXECUTE FUNCTION homehub_private.check_shopping_list();
CREATE OR REPLACE FUNCTION public.save_collection(_table text,_household uuid,_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cols text[]; defaults jsonb; change jsonb; vals jsonb; oldrow jsonb; saved jsonb; result jsonb:='[]'; rid uuid; expected bigint; collist text; expressions text; assignments text;
BEGIN
 PERFORM homehub_private.lock_household(_household);
 CASE _table
  WHEN 'chores' THEN cols:=ARRAY['title','member_key','done','when_label','position','due_date']; defaults:='{"done":false,"when_label":"Hoy","position":0}';
  WHEN 'shopping_items' THEN cols:=ARRAY['name','done','position','list_id']; defaults:=jsonb_build_object('done',false,'position',0,'list_id',_household);
  WHEN 'events' THEN cols:=ARRAY['title','date','time','member_key','note']; defaults:='{"time":"","note":""}';
  WHEN 'notes' THEN cols:=ARRAY['title','body','member_key','pinned']; defaults:='{"body":"","pinned":false}';
  WHEN 'contributions' THEN cols:=ARRAY['person_key','amount','month','note','occurred_on']; defaults:='{"note":""}';
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


-- Lists and products share one caller-bound durable receipt and transaction.
-- The original sync_shopping contract/receipts remain valid for legacy outboxes.
CREATE FUNCTION public.sync_shopping_lists(_household uuid,_mutation_id uuid,_changes jsonb,_list_changes jsonb DEFAULT '[]',_member_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id text; digest text; receipt homehub_private.shopping_receipts; saved jsonb; lists jsonb:='[]';
 c jsonb; vals jsonb; rid uuid; expected bigint; old public.shopping_lists; row public.shopping_lists;
BEGIN
 PERFORM homehub_private.lock_household(_household);
 IF _mutation_id IS NULL OR jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_changes)>100
 OR jsonb_typeof(_list_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_list_changes)>20 THEN RAISE EXCEPTION 'Invalid shopping mutation' USING ERRCODE='22023'; END IF;
 IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.my_context() x WHERE x.household_id=_household AND x.member_key=_member_key) THEN RAISE EXCEPTION 'Household member changed; sign in again' USING ERRCODE='42501'; END IF;
 actor_id:='lists:'||CASE WHEN auth.uid() IS NOT NULL THEN 'account:'||auth.uid()::text ELSE 'device:'||encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-device-token',''),'sha256'),'hex') END;
 digest:=encode(extensions.digest(jsonb_build_array(_changes,_list_changes)::text,'sha256'),'hex');
 SELECT * INTO receipt FROM homehub_private.shopping_receipts WHERE household_id=_household AND actor=actor_id AND mutation_id=_mutation_id;
 IF receipt.mutation_id IS NOT NULL THEN
  IF receipt.request_hash<>digest THEN RAISE EXCEPTION 'Mutation identity reused with different data' USING ERRCODE='22023'; END IF;
  RETURN receipt.result;
 END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(_list_changes) LOOP
  rid:=(c->>'id')::uuid; expected:=(c->>'expected_revision')::bigint; vals:=coalesce(c->'values','{}');
  IF rid IS NULL OR coalesce(c->>'operation','') NOT IN('insert','update') OR jsonb_typeof(vals) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(vals) k WHERE k NOT IN('name','archived','position')) THEN RAISE EXCEPTION 'Invalid list fields' USING ERRCODE='22023'; END IF;
  SELECT * INTO old FROM public.shopping_lists WHERE id=rid AND household_id=_household FOR UPDATE;
  IF c->>'operation'='insert' THEN
   IF old.id IS NOT NULL OR expected IS NOT NULL THEN RAISE EXCEPTION 'Shopping list changed' USING ERRCODE='40001'; END IF;
   IF (SELECT count(*) FROM public.shopping_lists WHERE household_id=_household)>=20 THEN RAISE EXCEPTION 'Maximum 20 shopping lists' USING ERRCODE='54000'; END IF;
   INSERT INTO public.shopping_lists(id,household_id,name,archived,position)
    VALUES(rid,_household,btrim(vals->>'name'),coalesce((vals->>'archived')::boolean,false),coalesce((vals->>'position')::integer,0)) RETURNING * INTO row;
  ELSE
   IF old.id IS NULL OR expected IS NULL OR old.revision<>expected THEN RAISE EXCEPTION 'Shopping list changed' USING ERRCODE='40001'; END IF;
   UPDATE public.shopping_lists SET name=btrim(coalesce(vals->>'name',old.name)),archived=coalesce((vals->>'archived')::boolean,old.archived),position=coalesce((vals->>'position')::integer,old.position),revision=old.revision+1
   WHERE id=rid AND household_id=_household RETURNING * INTO row;
  END IF;
  lists:=lists||jsonb_build_array(to_jsonb(row));
 END LOOP;
 saved:=jsonb_build_object('items',public.save_collection('shopping_items',_household,_changes),'lists',lists);
 INSERT INTO homehub_private.shopping_receipts(household_id,actor,mutation_id,request_hash,result) VALUES(_household,actor_id,_mutation_id,digest,saved);
 DELETE FROM homehub_private.shopping_receipts WHERE household_id=_household AND created_at<now()-interval '30 days';
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.sync_shopping_lists(uuid,uuid,jsonb,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_shopping_lists(uuid,uuid,jsonb,jsonb,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
