-- Sub-admin tier: can post forecasts and enter results, nothing else.
-- can_manage_content covers admin, superadmin and subadmin for content work only.
CREATE OR REPLACE FUNCTION public.can_manage_content(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'superadmin', 'subadmin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_content(uuid) FROM anon;

-- Content RPCs now accept subadmins (bodies unchanged apart from the role check).
CREATE OR REPLACE FUNCTION public.publish_forecast(_forecast_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare f record; d record; g record; c record; n int;
begin
  if not public.can_manage_content(auth.uid()) then raise exception 'Forbidden'; end if;
  select * into f from forecasts where id = _forecast_id for update;
  if f.status not in ('draft','scheduled') then raise exception 'Forecast is not a draft'; end if;
  select * into d from draws where id = f.draw_id;
  select * into g from games where id = d.game_id;
  if now() >= d.publication_cutoff_at then raise exception 'Publication cutoff has passed for this draw'; end if;
  if not exists (select 1 from forecast_combinations where forecast_id = f.id) then raise exception 'Add at least one combination'; end if;
  if f.forecast_type = 'single' and (select count(*) from forecast_combinations where forecast_id=f.id) > 1 then raise exception 'Single-set forecasts have one combination'; end if;
  for c in select * from forecast_combinations where forecast_id = f.id loop
    select count(*) into n from forecast_numbers where combination_id = c.id and number_type='regular';
    if n <> g.numbers_per_combination then raise exception 'Combination % needs exactly % numbers', c.combination_number, g.numbers_per_combination; end if;
  end loop;
  update forecasts set status='published', published_at=now(), published_by=auth.uid(), cutoff_at=d.publication_cutoff_at where id = f.id;
  if f.supersedes_forecast_id is not null then update forecasts set status='superseded' where id = f.supersedes_forecast_id; end if;
  insert into audit_logs(actor_user_id, action, entity_type, entity_id) values (auth.uid(),'publish','forecast',f.id);
end
$$;

CREATE OR REPLACE FUNCTION public.create_forecast_correction(_forecast_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare f record; nid uuid; c record; ncid uuid;
begin
  if not public.can_manage_content(auth.uid()) then raise exception 'Forbidden'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'A reason is required'; end if;
  select * into f from forecasts where id = _forecast_id;
  if f.status <> 'published' then raise exception 'Only published forecasts can be corrected'; end if;
  insert into forecasts(draw_id, forecast_type, version, supersedes_forecast_id, correction_reason, created_by)
    values (f.draw_id, f.forecast_type, f.version+1, f.id, _reason, auth.uid()) returning id into nid;
  for c in select * from forecast_combinations where forecast_id = f.id order by combination_number loop
    insert into forecast_combinations(forecast_id, combination_number) values (nid, c.combination_number) returning id into ncid;
    insert into forecast_numbers(combination_id, number_value, number_type) select ncid, number_value, number_type from forecast_numbers where combination_id = c.id;
  end loop;
  insert into audit_logs(actor_user_id, action, entity_type, entity_id, reason) values (auth.uid(),'correction_draft','forecast',nid,_reason);
  return nid;
end
$$;

CREATE OR REPLACE FUNCTION public.verify_result(_result_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare r record; g record; n int; prev record;
begin
  if not public.can_manage_content(auth.uid()) then raise exception 'Forbidden'; end if;
  select * into r from draw_results where id = _result_id for update;
  if r.status <> 'pending' then raise exception 'Result is not pending'; end if;
  select gm.* into g from draws d join games gm on gm.id=d.game_id where d.id = r.draw_id;
  select count(*) into n from result_numbers where result_id = r.id and number_type='regular';
  if n <> g.numbers_drawn then raise exception 'Exactly % winning numbers are required', g.numbers_drawn; end if;
  if coalesce(r.source_url,'') = '' then raise exception 'Attach the official source link'; end if;
  for prev in select * from draw_results where draw_id = r.draw_id and status = 'verified' loop
    if coalesce(trim(r.correction_reason),'') = '' then raise exception 'A correction reason is required to replace a verified result'; end if;
    update draw_results set status='superseded' where id = prev.id;
    delete from forecast_scores where result_id = prev.id;
  end loop;
  update draw_results set status='verified', verified_by=auth.uid(), verified_at=now() where id = r.id;
  update draws set draw_status='verified', result_verified_at=now(), updated_at=now() where id = r.draw_id;
  insert into audit_logs(actor_user_id, action, entity_type, entity_id, reason) values (auth.uid(), case when r.correction_reason is null then 'verify' else 'verify_correction' end,'draw_result',r.id,r.correction_reason);
  return public.score_result(r.id);
end
$$;

-- Subadmin write policies mirroring the admin ones on content tables.
CREATE POLICY "content write forecasts"
ON public.forecasts FOR ALL TO authenticated
USING (public.can_manage_content(auth.uid()) AND status IN ('draft','scheduled'))
WITH CHECK (public.can_manage_content(auth.uid()) AND status IN ('draft','scheduled'));

CREATE POLICY "content read forecasts"
ON public.forecasts FOR SELECT TO authenticated
USING (public.can_manage_content(auth.uid()));

CREATE POLICY "content write combos"
ON public.forecast_combinations FOR ALL TO authenticated
USING (public.can_manage_content(auth.uid()) AND EXISTS (SELECT 1 FROM forecasts f WHERE f.id = forecast_combinations.forecast_id AND f.status IN ('draft','scheduled')))
WITH CHECK (public.can_manage_content(auth.uid()) AND EXISTS (SELECT 1 FROM forecasts f WHERE f.id = forecast_combinations.forecast_id AND f.status IN ('draft','scheduled')));

CREATE POLICY "content write numbers"
ON public.forecast_numbers FOR ALL TO authenticated
USING (public.can_manage_content(auth.uid()) AND EXISTS (SELECT 1 FROM forecast_combinations c JOIN forecasts f ON f.id = c.forecast_id WHERE c.id = forecast_numbers.combination_id AND f.status IN ('draft','scheduled')))
WITH CHECK (public.can_manage_content(auth.uid()) AND EXISTS (SELECT 1 FROM forecast_combinations c JOIN forecasts f ON f.id = c.forecast_id WHERE c.id = forecast_numbers.combination_id AND f.status IN ('draft','scheduled')));

CREATE POLICY "content write results"
ON public.draw_results FOR ALL TO authenticated
USING (public.can_manage_content(auth.uid()) AND status = 'pending')
WITH CHECK (public.can_manage_content(auth.uid()) AND status = 'pending');

CREATE POLICY "content read results"
ON public.draw_results FOR SELECT TO authenticated
USING (public.can_manage_content(auth.uid()));

CREATE POLICY "content write result numbers"
ON public.result_numbers FOR ALL TO authenticated
USING (public.can_manage_content(auth.uid()) AND EXISTS (SELECT 1 FROM draw_results r WHERE r.id = result_numbers.result_id AND r.status = 'pending'))
WITH CHECK (public.can_manage_content(auth.uid()) AND EXISTS (SELECT 1 FROM draw_results r WHERE r.id = result_numbers.result_id AND r.status = 'pending'));

CREATE POLICY "content read result numbers"
ON public.result_numbers FOR SELECT TO authenticated
USING (public.can_manage_content(auth.uid()));

-- Superadmin role management now supports granting 'admin' or 'subadmin'.
CREATE OR REPLACE FUNCTION public.grant_role(_target_user uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'superadmin') then
    raise exception 'Forbidden: superadmin only';
  end if;
  if _role not in ('admin', 'subadmin') then raise exception 'Only admin or subadmin can be granted'; end if;
  insert into public.user_roles(user_id, role) values (_target_user, _role::app_role)
  on conflict (user_id, role) do nothing;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'grant_' || _role, 'user_role', _target_user, _role || ' role granted by superadmin');
end
$$;

CREATE OR REPLACE FUNCTION public.revoke_role(_target_user uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'superadmin') then
    raise exception 'Forbidden: superadmin only';
  end if;
  if _role not in ('admin', 'subadmin') then raise exception 'Only admin or subadmin can be revoked'; end if;
  delete from public.user_roles where user_id = _target_user and role = _role::app_role;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'revoke_' || _role, 'user_role', _target_user, _role || ' role revoked by superadmin');
end
$$;

REVOKE EXECUTE ON FUNCTION public.grant_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_role(uuid, text) FROM anon;