-- Read-only regression checks; run after the Phase 2 follow-up.
DO $$
DECLARE n int; definition text;
BEGIN
 SELECT count(*) INTO n FROM public.import_rows ir
 JOIN public.import_batches b ON b.id=ir.batch_id
 JOIN public.draws d ON d.id=ir.draw_id
 JOIN public.draw_results r ON r.id=ir.result_id
 WHERE b.id='a7c0afe1-d147-4366-8448-9bfe6c2e263f' AND r.status='pending'
 AND (d.scheduled_at AT TIME ZONE 'Africa/Lagos')::date=ir.draw_date
 AND (d.scheduled_at AT TIME ZONE 'Africa/Lagos')::time='10:00'::time
 AND r.source_url=b.source_url;
 IF n<>42 THEN RAISE EXCEPTION 'Expected 42 unchanged pending imported records, got %',n; END IF;
 SELECT pg_get_functiondef('public.score_result(uuid)'::regprocedure) INTO definition;
 IF position('rn.number_type=''regular''' IN definition)=0 OR position('fn.number_type=''regular''' IN definition)=0 THEN
   RAISE EXCEPTION 'Scoring must filter both forecast and result groups to winning numbers';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.games WHERE slug='goldenchance-morning-dew' AND default_draw_time='11:15'::time AND schedule_status='provisional' AND min_match_threshold=2) THEN
   RAISE EXCEPTION 'Expected provisional 11:15 schedule and retained 2+ winning threshold';
 END IF;
END $$;