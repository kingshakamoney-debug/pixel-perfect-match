ALTER TABLE public.draws ADD COLUMN IF NOT EXISTS draw_number text;
ALTER TABLE public.draws ADD CONSTRAINT draws_draw_number_format CHECK (draw_number IS NULL OR draw_number ~ '^[0-9A-Za-z-]{1,20}$');
CREATE UNIQUE INDEX IF NOT EXISTS draws_game_draw_number_uidx ON public.draws(game_id, draw_number) WHERE draw_number IS NOT NULL;

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  format text NOT NULL CHECK (format IN ('morning_dew')),
  source_url text NOT NULL CHECK (source_url ~ '^https?://'),
  draw_time time NOT NULL,
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','published')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  raw_text text NOT NULL,
  draw_number text,
  draw_date date,
  group1 text[] NOT NULL DEFAULT '{}',
  group2 text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('valid','error','conflict','published','skipped')),
  message text,
  draw_id uuid REFERENCES public.draws(id),
  result_id uuid REFERENCES public.draw_results(id),
  UNIQUE (batch_id, line_no)
);
GRANT SELECT ON public.import_batches, public.import_rows TO authenticated;
GRANT ALL ON public.import_batches, public.import_rows TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read import batches" ON public.import_batches FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read import rows" ON public.import_rows FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Server-side revalidation of one Morning-dew style row. Returns error text or null.
CREATE OR REPLACE FUNCTION public.import_row_error(_num text, _date text, _g1 text[], _g2 text[], _min int, _max int)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE x text;
BEGIN
  IF _num IS NULL OR _num !~ '^\d{4}$' THEN RETURN 'Draw number must be 4 digits'; END IF;
  IF _date IS NULL OR _date !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN 'Invalid date'; END IF;
  BEGIN PERFORM _date::date; EXCEPTION WHEN others THEN RETURN 'Invalid date'; END;
  IF coalesce(array_length(_g1,1),0) <> 5 OR coalesce(array_length(_g2,1),0) <> 5 THEN RETURN 'Each group needs five numbers'; END IF;
  FOREACH x IN ARRAY _g1 || _g2 LOOP
    IF x !~ '^\d{2}$' THEN RETURN 'Numbers must be two digits'; END IF;
    IF x::int < _min OR x::int > _max THEN RETURN format('%s is outside %s–%s', x, _min, _max); END IF;
  END LOOP;
  IF (SELECT count(DISTINCT v) FROM unnest(_g1) v) <> 5 OR (SELECT count(DISTINCT v) FROM unnest(_g2) v) <> 5 THEN RETURN 'A group repeats a number'; END IF;
  RETURN NULL;
END $$;

-- Stage: revalidates every row and checks conflicts. Nothing public is written.
CREATE OR REPLACE FUNCTION public.stage_import(_game_id uuid, _source_url text, _draw_time time, _rows jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; bid uuid; r jsonb; e text; st text; d record; g1 text[]; g2 text[]; ts timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden: admins only'; END IF;
  SELECT * INTO g FROM games WHERE id = _game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF coalesce((g.bonus_number_rules->>'count')::int,0) <> 5 OR g.numbers_drawn <> 5 THEN
    RAISE EXCEPTION 'This game must be configured with 5 winning and 5 machine (bonus) numbers before a Morning-dew import'; END IF;
  IF _source_url IS NULL OR _source_url !~ '^https?://' THEN RAISE EXCEPTION 'Add the official source link'; END IF;
  IF jsonb_array_length(_rows) = 0 OR jsonb_array_length(_rows) > 2000 THEN RAISE EXCEPTION 'Between 1 and 2000 rows per batch'; END IF;
  INSERT INTO import_batches(game_id, format, source_url, draw_time, created_by) VALUES (_game_id,'morning_dew',trim(_source_url),_draw_time,auth.uid()) RETURNING id INTO bid;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    g1 := ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'group1','[]')));
    g2 := ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'group2','[]')));
    e := coalesce(nullif(r->>'error',''), public.import_row_error(r->>'drawNumber', r->>'date', g1, g2, g.min_number, g.max_number));
    st := CASE WHEN e IS NULL THEN 'valid' ELSE 'error' END;
    IF e IS NULL AND EXISTS (SELECT 1 FROM import_rows ir WHERE ir.batch_id = bid AND (ir.draw_number = r->>'drawNumber' OR ir.draw_date = (r->>'date')::date)) THEN
      st := 'error'; e := 'Duplicate draw number or date in this batch'; END IF;
    IF st = 'valid' THEN
      ts := ((r->>'date')::date + _draw_time) AT TIME ZONE g.timezone;
      SELECT dr.* INTO d FROM draws dr WHERE dr.game_id = _game_id AND (dr.draw_number = r->>'drawNumber' OR (dr.scheduled_at AT TIME ZONE g.timezone)::date = (r->>'date')::date) LIMIT 1;
      IF FOUND THEN
        IF d.draw_number IS NOT NULL AND d.draw_number <> r->>'drawNumber' THEN st := 'conflict'; e := format('Date already belongs to draw %s', d.draw_number);
        ELSIF (d.scheduled_at AT TIME ZONE g.timezone)::date <> (r->>'date')::date THEN st := 'conflict'; e := 'Draw number already exists on a different date';
        ELSIF EXISTS (SELECT 1 FROM draw_results WHERE draw_id = d.id AND status IN ('verified','pending')) THEN st := 'conflict'; e := 'This draw already has a result; use a correction instead';
        END IF;
      ELSIF ts > now() THEN st := 'error'; e := 'Draw date is in the future';
      END IF;
    END IF;
    INSERT INTO import_rows(batch_id, line_no, raw_text, draw_number, draw_date, group1, group2, status, message)
    VALUES (bid, (r->>'line')::int, left(coalesce(r->>'raw',''),500), r->>'drawNumber',
      CASE WHEN r->>'date' ~ '^\d{4}-\d{2}-\d{2}$' AND e IS DISTINCT FROM 'Invalid date' THEN (r->>'date')::date END, g1, g2, st, e);
  END LOOP;
  INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id) VALUES (auth.uid(),'stage_import','import_batch',bid);
  RETURN bid;
END $$;

-- Publish: creates draws + PENDING (unverified) results for valid rows. Idempotent; never overwrites results.
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
    UPDATE import_rows SET status='published', draw_id = did, result_id = rid WHERE id = r.id;
    n := n + 1;
  END LOOP;
  UPDATE import_batches SET status='published', published_at = now() WHERE id = _batch_id;
  INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, reason) VALUES (auth.uid(),'publish_import','import_batch',_batch_id, n || ' pending result(s) created');
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.stage_import(uuid,text,time,jsonb), public.publish_import(uuid), public.import_row_error(text,text,text[],text[],int,int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.stage_import(uuid,text,time,jsonb), public.publish_import(uuid) TO authenticated;