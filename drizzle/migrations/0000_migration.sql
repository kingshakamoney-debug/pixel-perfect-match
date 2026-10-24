
create type public.app_role as enum ('admin','member');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own roles read" on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

-- prevent users changing account_status themselves
create or replace function public.protect_profile() returns trigger language plpgsql set search_path = public as $$
begin
  if new.account_status is distinct from old.account_status and not public.has_role(auth.uid(),'admin') then
    raise exception 'Not allowed to change account status';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  insert into public.user_roles(user_id, role) values (new.id, 'member');
  -- bootstrap: first account becomes administrator
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- audit
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "admin read audit" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));

-- providers & games
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  source_url text,
  timezone text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
create table public.games (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  name text not null,
  slug text not null unique,
  timezone text not null,
  min_number int not null default 1,
  max_number int not null,
  numbers_drawn int not null,
  numbers_per_combination int not null,
  min_match_threshold int not null default 2,
  bonus_number_rules jsonb,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_number < max_number),
  check (numbers_drawn > 0 and numbers_drawn <= max_number - min_number + 1),
  check (numbers_per_combination > 0 and numbers_per_combination <= max_number - min_number + 1),
  check (min_match_threshold >= 1)
);
create index on public.games(provider_id);
create table public.draw_schedules (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  recurrence_config jsonb not null default '{"weekdays":[]}',
  local_draw_time time not null,
  timezone text not null,
  effective_from date not null default current_date,
  effective_until date,
  status text not null default 'active' check (status in ('active','inactive'))
);
create table public.draws (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  scheduled_at timestamptz not null,
  draw_status text not null default 'scheduled' check (draw_status in ('scheduled','drawn','verified','cancelled')),
  publication_cutoff_at timestamptz not null,
  result_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, scheduled_at)
);
create index on public.draws(scheduled_at);

grant select on public.providers, public.games, public.draw_schedules, public.draws to anon, authenticated;
grant insert, update, delete on public.providers, public.games, public.draw_schedules, public.draws to authenticated;
grant all on public.providers, public.games, public.draw_schedules, public.draws to service_role;
alter table public.providers enable row level security;
alter table public.games enable row level security;
alter table public.draw_schedules enable row level security;
alter table public.draws enable row level security;
create policy "public read providers" on public.providers for select using (status = 'active' or public.has_role(auth.uid(),'admin'));
create policy "admin write providers" on public.providers for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read games" on public.games for select using (status = 'active' or public.has_role(auth.uid(),'admin'));
create policy "admin write games" on public.games for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read schedules" on public.draw_schedules for select using (true);
create policy "admin write schedules" on public.draw_schedules for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "public read draws" on public.draws for select using (true);
create policy "admin write draws" on public.draws for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- subscriptions & trials (entitlement inputs)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider_name text not null default 'paystack',
  provider_customer_reference text,
  provider_subscription_reference text unique,
  plan_code text,
  status text not null check (status in ('active','past_due','cancelled','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.trial_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','expired','revoked')),
  created_at timestamptz not null default now()
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider_name, provider_event_id)
);
grant select on public.subscriptions, public.trial_grants to authenticated;
grant all on public.subscriptions, public.trial_grants, public.payment_events to service_role;
alter table public.subscriptions enable row level security;
alter table public.trial_grants enable row level security;
alter table public.payment_events enable row level security;
create policy "own subs" on public.subscriptions for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));
create policy "own trial" on public.trial_grants for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

create or replace function public.get_entitlement(_user_id uuid)
returns table(allowed boolean, reason text, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare s record; t record;
begin
  if _user_id is null then return query select false, 'anonymous'::text, null::timestamptz; return; end if;
  if exists (select 1 from profiles where user_id = _user_id and account_status = 'suspended') then
    return query select false, 'suspended'::text, null::timestamptz; return; end if;
  if public.has_role(_user_id,'admin') then return query select true, 'admin'::text, null::timestamptz; return; end if;
  select * into s from subscriptions where user_id = _user_id and status in ('active','past_due','cancelled') and current_period_end > now() order by current_period_end desc limit 1;
  if found then return query select true, 'active_subscription'::text, s.current_period_end; return; end if;
  select * into t from trial_grants where user_id = _user_id and status = 'active' limit 1;
  if found and t.expires_at > now() then return query select true, 'trialing'::text, t.expires_at; return; end if;
  if found then return query select false, 'expired'::text, t.expires_at; return; end if;
  return query select false, 'unpaid'::text, null::timestamptz;
end $$;
create or replace function public.has_premium(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select allowed from public.get_entitlement(_user_id)), false)
$$;
revoke execute on function public.get_entitlement(uuid) from anon, public;
grant execute on function public.get_entitlement(uuid) to authenticated;

-- forecasts
create table public.forecasts (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete restrict,
  forecast_type text not null check (forecast_type in ('single','multiple')),
  status text not null default 'draft' check (status in ('draft','scheduled','published','superseded')),
  version int not null default 1,
  published_at timestamptz,
  publish_at timestamptz,
  published_by uuid,
  cutoff_at timestamptz,
  supersedes_forecast_id uuid references public.forecasts(id),
  correction_reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.forecasts(draw_id);
create table public.forecast_combinations (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.forecasts(id) on delete cascade,
  combination_number int not null,
  created_at timestamptz not null default now(),
  unique(forecast_id, combination_number)
);
create table public.forecast_numbers (
  id uuid primary key default gen_random_uuid(),
  combination_id uuid not null references public.forecast_combinations(id) on delete cascade,
  number_value int not null,
  number_type text not null default 'regular' check (number_type in ('regular','bonus')),
  unique(combination_id, number_value, number_type)
);
create table public.draw_results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','verified','superseded','invalid')),
  source_url text,
  submitted_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  correction_reason text,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index on public.draw_results(draw_id);
create table public.result_numbers (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.draw_results(id) on delete cascade,
  number_value int not null,
  number_type text not null default 'regular' check (number_type in ('regular','bonus')),
  unique(result_id, number_value, number_type)
);
create table public.forecast_scores (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.forecasts(id),
  combination_id uuid not null references public.forecast_combinations(id),
  result_id uuid not null references public.draw_results(id),
  hit_count int not null,
  is_success boolean not null,
  classification text not null,
  scored_at timestamptz not null default now(),
  scoring_version int not null default 1,
  unique(combination_id, result_id)
);

grant select on public.forecasts, public.forecast_combinations, public.forecast_numbers, public.draw_results, public.result_numbers, public.forecast_scores to anon, authenticated;
grant insert, update, delete on public.forecasts, public.forecast_combinations, public.forecast_numbers, public.draw_results, public.result_numbers to authenticated;
grant all on public.forecasts, public.forecast_combinations, public.forecast_numbers, public.draw_results, public.result_numbers, public.forecast_scores to service_role;
alter table public.forecasts enable row level security;
alter table public.forecast_combinations enable row level security;
alter table public.forecast_numbers enable row level security;
alter table public.draw_results enable row level security;
alter table public.result_numbers enable row level security;
alter table public.forecast_scores enable row level security;

-- visibility: published forecast metadata is public; numbers public only after verified result, else entitled
create or replace function public.can_view_forecast_numbers(_forecast_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from forecasts f join draws d on d.id = f.draw_id
    where f.id = _forecast_id and (
      public.has_role(auth.uid(),'admin')
      or (f.status in ('published','superseded') and (d.result_verified_at is not null or public.has_premium(auth.uid())))
    ))
$$;

create policy "read forecasts" on public.forecasts for select using (status in ('published','superseded') or public.has_role(auth.uid(),'admin'));
create policy "admin write forecasts" on public.forecasts for all to authenticated using (public.has_role(auth.uid(),'admin') and status in ('draft','scheduled')) with check (public.has_role(auth.uid(),'admin') and status in ('draft','scheduled'));
create policy "read combos" on public.forecast_combinations for select using (public.can_view_forecast_numbers(forecast_id));
create policy "admin write combos" on public.forecast_combinations for all to authenticated
  using (public.has_role(auth.uid(),'admin') and exists (select 1 from forecasts f where f.id = forecast_id and f.status in ('draft','scheduled')))
  with check (public.has_role(auth.uid(),'admin') and exists (select 1 from forecasts f where f.id = forecast_id and f.status in ('draft','scheduled')));
create policy "read numbers" on public.forecast_numbers for select using (exists (select 1 from forecast_combinations c where c.id = combination_id and public.can_view_forecast_numbers(c.forecast_id)));
create policy "admin write numbers" on public.forecast_numbers for all to authenticated
  using (public.has_role(auth.uid(),'admin') and exists (select 1 from forecast_combinations c join forecasts f on f.id=c.forecast_id where c.id = combination_id and f.status in ('draft','scheduled')))
  with check (public.has_role(auth.uid(),'admin') and exists (select 1 from forecast_combinations c join forecasts f on f.id=c.forecast_id where c.id = combination_id and f.status in ('draft','scheduled')));

create policy "read results" on public.draw_results for select using (status in ('verified','superseded') or public.has_role(auth.uid(),'admin'));
create policy "admin write results" on public.draw_results for all to authenticated using (public.has_role(auth.uid(),'admin') and status = 'pending') with check (public.has_role(auth.uid(),'admin') and status = 'pending');
create policy "read result numbers" on public.result_numbers for select using (exists (select 1 from draw_results r where r.id = result_id and (r.status in ('verified','superseded') or public.has_role(auth.uid(),'admin'))));
create policy "admin write result numbers" on public.result_numbers for all to authenticated
  using (public.has_role(auth.uid(),'admin') and exists (select 1 from draw_results r where r.id = result_id and r.status='pending'))
  with check (public.has_role(auth.uid(),'admin') and exists (select 1 from draw_results r where r.id = result_id and r.status='pending'));
create policy "read scores" on public.forecast_scores for select using (true);

-- number validation against game rules
create or replace function public.validate_forecast_number() returns trigger language plpgsql set search_path = public as $$
declare g record; cnt int;
begin
  select gm.* into g from forecast_combinations c join forecasts f on f.id=c.forecast_id join draws d on d.id=f.draw_id join games gm on gm.id=d.game_id where c.id = new.combination_id;
  if new.number_value < g.min_number or new.number_value > g.max_number then
    raise exception 'Number % is outside % - %', new.number_value, g.min_number, g.max_number; end if;
  if new.number_type = 'regular' then
    select count(*) into cnt from forecast_numbers where combination_id = new.combination_id and number_type='regular' and id <> new.id;
    if cnt >= g.numbers_per_combination then raise exception 'Too many numbers in combination (max %)', g.numbers_per_combination; end if;
  end if;
  return new;
end $$;
create trigger forecast_numbers_validate before insert or update on public.forecast_numbers for each row execute function public.validate_forecast_number();

create or replace function public.validate_result_number() returns trigger language plpgsql set search_path = public as $$
declare g record; cnt int;
begin
  select gm.* into g from draw_results r join draws d on d.id=r.draw_id join games gm on gm.id=d.game_id where r.id = new.result_id;
  if new.number_value < g.min_number or new.number_value > g.max_number then
    raise exception 'Number % is outside % - %', new.number_value, g.min_number, g.max_number; end if;
  if new.number_type = 'regular' then
    select count(*) into cnt from result_numbers where result_id = new.result_id and number_type='regular' and id <> new.id;
    if cnt >= g.numbers_drawn then raise exception 'Too many winning numbers (max %)', g.numbers_drawn; end if;
  end if;
  return new;
end $$;
create trigger result_numbers_validate before insert or update on public.result_numbers for each row execute function public.validate_result_number();

-- publish forecast (server timestamp, cutoff enforced)
create or replace function public.publish_forecast(_forecast_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record; d record; g record; c record; n int;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
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
end $$;

-- create correction version of a published forecast
create or replace function public.create_forecast_correction(_forecast_id uuid, _reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f record; nid uuid; c record; ncid uuid;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
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
end $$;

-- verify result + idempotent scoring
create or replace function public.score_result(_result_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; g record; c record; hits int; total int := 0;
begin
  select * into r from draw_results where id = _result_id and status = 'verified';
  if not found then return 0; end if;
  select gm.* into g from draws d join games gm on gm.id=d.game_id where d.id = r.draw_id;
  for c in select fc.* , f.id as fid from forecast_combinations fc join forecasts f on f.id = fc.forecast_id
           where f.draw_id = r.draw_id and f.status in ('published','superseded') and f.published_at is not null loop
    select count(distinct fn.number_value) into hits from forecast_numbers fn
      join result_numbers rn on rn.number_value = fn.number_value and rn.result_id = r.id and rn.number_type='regular'
      where fn.combination_id = c.id and fn.number_type='regular';
    insert into forecast_scores(forecast_id, combination_id, result_id, hit_count, is_success, classification)
      values (c.fid, c.id, r.id, hits, hits >= g.min_match_threshold, hits || '_hit')
      on conflict (combination_id, result_id) do update set hit_count = excluded.hit_count, is_success = excluded.is_success, classification = excluded.classification, scored_at = now();
    total := total + 1;
  end loop;
  return total;
end $$;
revoke execute on function public.score_result(uuid) from anon, authenticated, public;

create or replace function public.verify_result(_result_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; g record; n int; prev record;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden'; end if;
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
end $$;
revoke execute on function public.publish_forecast(uuid), public.create_forecast_correction(uuid,text), public.verify_result(uuid) from anon, public;
grant execute on function public.publish_forecast(uuid), public.create_forecast_correction(uuid,text), public.verify_result(uuid) to authenticated;

-- seed providers & games (configuration, not results)
insert into public.providers(name, slug, source_url, timezone) values
  ('Ghana NLA','ghana-nla','https://www.nla.gov.gh','Africa/Accra'),
  ('Golden Chance Lotto','golden-chance','https://www.goldenchancelotto.com','Africa/Lagos');
insert into public.games(provider_id, name, slug, timezone, min_number, max_number, numbers_drawn, numbers_per_combination, min_match_threshold)
select id, 'National', 'nla-national', 'Africa/Accra', 1, 90, 5, 5, 2 from public.providers where slug='ghana-nla';
insert into public.games(provider_id, name, slug, timezone, min_number, max_number, numbers_drawn, numbers_per_combination, min_match_threshold)
select id, 'Morning Dew', 'goldenchance-morning-dew', 'Africa/Lagos', 1, 90, 5, 5, 2 from public.providers where slug='golden-chance';
