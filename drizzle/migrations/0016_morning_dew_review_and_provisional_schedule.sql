ALTER TABLE public.games ADD COLUMN default_draw_time time;
ALTER TABLE public.games ADD COLUMN schedule_status text NOT NULL DEFAULT 'unspecified' CHECK (schedule_status IN ('unspecified','provisional','confirmed'));
ALTER TABLE public.draws ADD COLUMN time_status text NOT NULL DEFAULT 'unspecified' CHECK (time_status IN ('unspecified','provisional','confirmed'));
UPDATE public.draws d SET time_status='provisional' WHERE EXISTS (SELECT 1 FROM public.import_rows ir WHERE ir.draw_id=d.id);
ALTER TABLE public.import_rows ADD COLUMN reviewed_by uuid;
ALTER TABLE public.import_rows ADD COLUMN reviewed_at timestamptz;
CREATE OR REPLACE FUNCTION public.snapshot_draw_time_status() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN SELECT schedule_status INTO NEW.time_status FROM public.games WHERE id=NEW.game_id; RETURN NEW; END $$;
CREATE TRIGGER snapshot_draw_time_status BEFORE INSERT ON public.draws FOR EACH ROW EXECUTE FUNCTION public.snapshot_draw_time_status();
CREATE OR REPLACE FUNCTION public.validate_verification_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g record; t text; expected int; lo int; hi int; n int; distinct_n int;
BEGIN
 IF NEW.status <> 'verified' OR OLD.status = 'verified' THEN RETURN NEW; END IF;
 SELECT gm.* INTO g FROM public.draws d JOIN public.games gm ON gm.id=d.game_id WHERE d.id=NEW.draw_id;
 IF EXISTS (SELECT 1 FROM public.result_numbers WHERE result_id=NEW.id AND number_type NOT IN ('regular','bonus')) THEN RAISE EXCEPTION 'Unknown result number group'; END IF;
 FOREACH t IN ARRAY ARRAY['regular','bonus'] LOOP
  expected := CASE WHEN t='regular' THEN g.numbers_drawn ELSE coalesce((g.bonus_number_rules->>'count')::int,0) END;
  lo := CASE WHEN t='regular' THEN g.min_number ELSE coalesce((g.bonus_number_rules->>'min')::int,g.min_number) END;
  hi := CASE WHEN t='regular' THEN g.max_number ELSE coalesce((g.bonus_number_rules->>'max')::int,g.max_number) END;
  SELECT count(*),count(DISTINCT number_value) INTO n,distinct_n FROM public.result_numbers WHERE result_id=NEW.id AND number_type=t;
  IF n<>expected OR distinct_n<>n OR EXISTS (SELECT 1 FROM public.result_numbers WHERE result_id=NEW.id AND number_type=t AND number_value NOT BETWEEN lo AND hi) THEN RAISE EXCEPTION 'Stored % numbers failed revalidation',t; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.import_rows WHERE draw_id=NEW.draw_id AND status='published') AND NOT EXISTS (SELECT 1 FROM public.draw_results WHERE draw_id=NEW.draw_id AND verified_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM public.import_rows WHERE result_id=NEW.id AND reviewed_by=auth.uid() AND reviewed_at IS NOT NULL) THEN RAISE EXCEPTION 'Check this imported record individually against the source before verification'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_verification_transition BEFORE UPDATE OF status ON public.draw_results FOR EACH ROW EXECUTE FUNCTION public.validate_verification_transition();
CREATE OR REPLACE FUNCTION public.review_import_result(_row_id uuid, _checked boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; g record; actual int[]; expected int[]; t text;
BEGIN
 IF NOT public.can_manage_content(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _checked IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm this record was checked against the source'; END IF;
 SELECT * INTO r FROM public.import_rows WHERE id=_row_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'published' OR r.result_id IS NULL THEN RAISE EXCEPTION 'Published import row required'; END IF;
 PERFORM 1 FROM public.draw_results WHERE id=r.result_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Result is not pending'; END IF;
 SELECT gm.* INTO g FROM public.import_batches b JOIN public.games gm ON gm.id=b.game_id WHERE b.id=r.batch_id;
 IF g.slug='goldenchance-morning-dew' AND (g.min_number<>1 OR g.max_number<>90 OR g.numbers_drawn<>5 OR g.numbers_per_combination<>5 OR g.min_match_threshold<>2 OR coalesce((g.bonus_number_rules->>'count')::int,0)<>5) THEN RAISE EXCEPTION 'Morning Dew winning-only scoring configuration requires review'; END IF;
 IF public.import_row_error(r.draw_number,r.draw_date::text,r.group1,r.group2,g.min_number,g.max_number) IS NOT NULL THEN RAISE EXCEPTION 'Stored import row failed revalidation'; END IF;
 FOREACH t IN ARRAY ARRAY['regular','bonus'] LOOP
  SELECT array_agg(number_value ORDER BY number_value) INTO actual FROM public.result_numbers WHERE result_id=r.result_id AND number_type=t;
  SELECT array_agg(v::int ORDER BY v::int) INTO expected FROM unnest(CASE WHEN t='regular' THEN r.group1 ELSE r.group2 END) v;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Stored % numbers differ from imported provenance',t; END IF;
 END LOOP;
 UPDATE public.import_rows SET reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,reason) VALUES(auth.uid(),'review_import_result','draw_result',r.result_id,'Individual source check confirmed; winning-only scoring');
 RETURN public.verify_result(r.result_id);
END $$;
REVOKE ALL ON FUNCTION public.review_import_result(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_import_result(uuid,boolean) TO authenticated;