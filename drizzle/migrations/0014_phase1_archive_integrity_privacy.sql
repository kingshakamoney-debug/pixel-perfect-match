-- C. Privacy: entitlement lookups only for yourself (or admins).
CREATE OR REPLACE FUNCTION public.get_entitlement(_user_id uuid)
 RETURNS TABLE(allowed boolean, reason text, expires_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s record; t record;
begin
  if _user_id is null then return query select false, 'anonymous'::text, null::timestamptz; return; end if;
  if auth.uid() is distinct from _user_id and not public.has_role(auth.uid(),'admin') then
    raise exception 'Forbidden: you can only read your own entitlement';
  end if;
  if exists (select 1 from profiles where user_id = _user_id and account_status = 'suspended') then
    return query select false, 'suspended'::text, null::timestamptz; return; end if;
  if public.has_role(_user_id,'admin') then return query select true, 'admin'::text, null::timestamptz; return; end if;
  select * into s from subscriptions where user_id = _user_id and status in ('active','past_due','cancelled') and current_period_end > now() order by current_period_end desc limit 1;
  if found then return query select true, 'active_subscription'::text, s.current_period_end; return; end if;
  select * into t from trial_grants where user_id = _user_id and status = 'active' limit 1;
  if found and t.expires_at > now() then return query select true, 'trialing'::text, t.expires_at; return; end if;
  if found then return query select false, 'expired'::text, t.expires_at; return; end if;
  return query select false, 'unpaid'::text, null::timestamptz;
end $function$;

CREATE OR REPLACE FUNCTION public.has_premium(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case
    when _user_id is null then false
    when auth.uid() is distinct from _user_id and not public.has_role(auth.uid(),'admin') then false
    else coalesce((select allowed from public.get_entitlement(_user_id)), false)
  end
$function$;

-- B. Integrity: one pending result per draw at a time.
CREATE UNIQUE INDEX IF NOT EXISTS draw_results_one_pending_per_draw ON public.draw_results(draw_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS draw_results_one_verified_per_draw ON public.draw_results(draw_id) WHERE status = 'verified';

-- Archive pagination/filtering.
CREATE INDEX IF NOT EXISTS draws_game_sched_id_idx ON public.draws(game_id, scheduled_at DESC, id DESC);

-- Bonus rules: games.bonus_number_rules = {"count":n,"min":a,"max":b}; null = no bonus numbers allowed.
CREATE OR REPLACE FUNCTION public.validate_result_number()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare g record; cnt int; bmin int; bmax int; bcount int;
begin
  select gm.* into g from draw_results r join draws d on d.id=r.draw_id join games gm on gm.id=d.game_id where r.id = new.result_id;
  if new.number_type = 'regular' then
    if new.number_value < g.min_number or new.number_value > g.max_number then
      raise exception 'Number % is outside % - %', new.number_value, g.min_number, g.max_number; end if;
    select count(*) into cnt from result_numbers where result_id = new.result_id and number_type='regular' and id <> new.id;
    if cnt >= g.numbers_drawn then raise exception 'Too many winning numbers (max %)', g.numbers_drawn; end if;
  else
    bcount := coalesce((g.bonus_number_rules->>'count')::int, 0);
    if bcount <= 0 then raise exception 'This game has no bonus numbers'; end if;
    bmin := coalesce((g.bonus_number_rules->>'min')::int, g.min_number);
    bmax := coalesce((g.bonus_number_rules->>'max')::int, g.max_number);
    if new.number_value < bmin or new.number_value > bmax then
      raise exception 'Bonus number % is outside % - %', new.number_value, bmin, bmax; end if;
    select count(*) into cnt from result_numbers where result_id = new.result_id and number_type='bonus' and id <> new.id;
    if cnt >= bcount then raise exception 'Too many bonus numbers (max %)', bcount; end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.verify_result(_result_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r record; g record; n int; b int; prev record;
begin
  if not public.can_manage_content(auth.uid()) then raise exception 'Forbidden'; end if;
  select * into r from draw_results where id = _result_id for update;
  if not found then raise exception 'Result not found'; end if;
  if r.status <> 'pending' then raise exception 'Result is not pending'; end if;
  select gm.* into g from draws d join games gm on gm.id=d.game_id where d.id = r.draw_id;
  select count(*) into n from result_numbers where result_id = r.id and number_type='regular';
  if n <> g.numbers_drawn then raise exception 'Exactly % winning numbers are required', g.numbers_drawn; end if;
  select count(*) into b from result_numbers where result_id = r.id and number_type='bonus';
  if b <> coalesce((g.bonus_number_rules->>'count')::int, 0) then
    raise exception 'Exactly % bonus number(s) are required', coalesce((g.bonus_number_rules->>'count')::int, 0); end if;
  if coalesce(r.source_url,'') !~ '^https?://' then raise exception 'Attach the official source link'; end if;
  for prev in select * from draw_results where draw_id = r.draw_id and status = 'verified' for update loop
    if coalesce(trim(r.correction_reason),'') = '' then raise exception 'A correction reason is required to replace a verified result'; end if;
    update draw_results set status='superseded' where id = prev.id;
    delete from forecast_scores where result_id = prev.id;
  end loop;
  update draw_results set status='verified', verified_by=auth.uid(), verified_at=now() where id = r.id;
  update draws set draw_status='verified', result_verified_at=now(), updated_at=now() where id = r.draw_id;
  insert into audit_logs(actor_user_id, action, entity_type, entity_id, reason) values (auth.uid(), case when r.correction_reason is null then 'verify' else 'verify_correction' end,'draw_result',r.id,r.correction_reason);
  return public.score_result(r.id);
end $function$;

-- Atomic submit + verify. Abandoned pending attempts for the draw are marked invalid (kept, not deleted).
CREATE OR REPLACE FUNCTION public.submit_result(_draw_id uuid, _numbers integer[], _bonus integer[], _source_url text, _correction_reason text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare d record; rid uuid; x int;
begin
  if not public.can_manage_content(auth.uid()) then raise exception 'Forbidden'; end if;
  select * into d from draws where id = _draw_id for update;
  if not found then raise exception 'Draw not found'; end if;
  if d.scheduled_at > now() then raise exception 'This draw has not happened yet'; end if;
  if (select count(*) from unnest(coalesce(_numbers,'{}')) ) <> (select count(distinct v) from unnest(coalesce(_numbers,'{}')) v) then
    raise exception 'Winning numbers must not repeat'; end if;
  if (select count(*) from unnest(coalesce(_bonus,'{}')) ) <> (select count(distinct v) from unnest(coalesce(_bonus,'{}')) v) then
    raise exception 'Bonus numbers must not repeat'; end if;
  update draw_results set status='invalid' where draw_id = _draw_id and status='pending';
  insert into draw_results(draw_id, source_url, correction_reason, submitted_by)
    values (_draw_id, trim(_source_url), nullif(trim(coalesce(_correction_reason,'')),''), auth.uid()) returning id into rid;
  foreach x in array coalesce(_numbers,'{}') loop insert into result_numbers(result_id, number_value, number_type) values (rid, x, 'regular'); end loop;
  foreach x in array coalesce(_bonus,'{}') loop insert into result_numbers(result_id, number_value, number_type) values (rid, x, 'bonus'); end loop;
  return public.verify_result(rid);
end $function$;
REVOKE EXECUTE ON FUNCTION public.submit_result(uuid, integer[], integer[], text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_result(uuid, integer[], integer[], text, text) TO authenticated;

-- Public archive: years with draws for a game.
CREATE OR REPLACE FUNCTION public.archive_years(_game_id uuid)
 RETURNS TABLE(year integer, draw_count bigint)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  select extract(year from (d.scheduled_at at time zone g.timezone))::int, count(*)
  from draws d join games g on g.id = d.game_id
  where d.game_id = _game_id and d.scheduled_at <= now()
  group by 1 order by 1 desc
$function$;
GRANT EXECUTE ON FUNCTION public.archive_years(uuid) TO anon, authenticated;