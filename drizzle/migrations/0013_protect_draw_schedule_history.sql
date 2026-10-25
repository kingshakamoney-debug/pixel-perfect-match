CREATE OR REPLACE FUNCTION public.protect_draw_schedule_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF EXISTS (SELECT 1 FROM public.forecasts WHERE draw_id = OLD.id) OR EXISTS (SELECT 1 FROM public.draw_results WHERE draw_id = OLD.id) THEN
   RAISE EXCEPTION 'This draw has forecasts or results and cannot be deleted';
  END IF;
  RETURN OLD;
 END IF;
 IF (NEW.game_id, NEW.scheduled_at, NEW.publication_cutoff_at) IS DISTINCT FROM (OLD.game_id, OLD.scheduled_at, OLD.publication_cutoff_at) THEN
  IF OLD.result_verified_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.forecasts WHERE draw_id = OLD.id AND (published_at IS NOT NULL OR status IN ('published', 'superseded'))) OR EXISTS (SELECT 1 FROM public.draw_results WHERE draw_id = OLD.id AND status IN ('verified', 'superseded')) THEN
   RAISE EXCEPTION 'Published draw schedules cannot be changed';
  END IF;
  IF NEW.publication_cutoff_at > NEW.scheduled_at THEN RAISE EXCEPTION 'Forecast cutoff must not be after the draw'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_draw_schedule_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_draw_schedule_history BEFORE UPDATE OR DELETE ON public.draws FOR EACH ROW EXECUTE FUNCTION public.protect_draw_schedule_history();