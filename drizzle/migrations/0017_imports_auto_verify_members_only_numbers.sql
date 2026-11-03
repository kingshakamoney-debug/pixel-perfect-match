DROP POLICY IF EXISTS "read result numbers" ON public.result_numbers;
CREATE POLICY "read result numbers" ON public.result_numbers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.draw_results r WHERE r.id = result_numbers.result_id AND (r.status IN ('verified','superseded') OR public.has_role(auth.uid(),'admin'))));
REVOKE SELECT ON public.result_numbers FROM anon;

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
 IF EXISTS (SELECT 1 FROM public.import_rows WHERE draw_id=NEW.draw_id AND status='published') AND NOT EXISTS (SELECT 1 FROM public.draw_results WHERE draw_id=NEW.draw_id AND verified_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM public.import_rows WHERE result_id=NEW.id AND reviewed_at IS NOT NULL) THEN RAISE EXCEPTION 'Imported record must be marked reviewed before verification'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.publish_import(_batch_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; g record; r record; did uuid; rid uuid; x text; n int := 0; ts timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden: admins only'; END IF;
  SELECT * INTO b FROM import_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF b.status = 'published' THEN RETURN 0; END IF;
  SELECT * INTO g FROM games WHERE id = b.game_id;
  FOR r IN SELECT * FROM import_rows WHERE batch_id = _batch_id AND status = 'valid' ORDER BY draw_date LOOP
    IF public.import_row_error(r.draw_number, r.draw_date::text, r.group1, r.group2, g.min_number, g.max_number) IS NOT NULL THEN
      UPDATE import_rows SET status='error', message='Failed revalidation' WHERE id = r.id; CONTINUE; END IF;
    ts := (r.draw_date + b.draw_time) AT TIME ZONE g.timezone;
    SELECT id INTO did FROM draws WHERE game_id = b.game_id AND (draw_number = r.draw_number OR (scheduled_at AT TIME ZONE g.timezone)::date = r.draw_date) LIMIT 1;
    IF did IS NOT NULL AND EXISTS (SELECT 1 FROM draw_results WHERE draw_id = did AND status IN ('verified','pending')) THEN
      UPDATE import_rows SET status='skipped', message='Draw got a result after staging', draw_id = did WHERE id = r.id; CONTINUE; END IF;
    IF did IS NULL THEN
      INSERT INTO draws(game_id, scheduled_at, publication_cutoff_at, draw_status, draw_number)
      VALUES (b.game_id, ts, ts, 'drawn', r.draw_number) RETURNING id INTO did;
    ELSE
      UPDATE draws SET draw_number = coalesce(draw_number, r.draw_number), draw_status = 'drawn', updated_at = now() WHERE id = did;
    END IF;
    INSERT INTO draw_results(draw_id, source_url, submitted_by) VALUES (did, b.source_url, auth.uid()) RETURNING id INTO rid;
    FOREACH x IN ARRAY r.group1 LOOP INSERT INTO result_numbers(result_id, number_value, number_type) VALUES (rid, x::int, 'regular'); END LOOP;
    FOREACH x IN ARRAY r.group2 LOOP INSERT INTO result_numbers(result_id, number_value, number_type) VALUES (rid, x::int, 'bonus'); END LOOP;
    UPDATE import_rows SET status='published', draw_id = did, result_id = rid, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = r.id;
    PERFORM public.verify_result(rid);
    n := n + 1;
  END LOOP;
  UPDATE import_batches SET status='published', published_at = now() WHERE id = _batch_id;
  INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, reason) VALUES (auth.uid(),'publish_import','import_batch',_batch_id, n || ' result(s) imported and displayed');
  RETURN n;
END $$;