-- 1. Remove unrestricted first-signup admin promotion from the signup trigger.
--    New accounts now always start as plain members.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles(user_id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  insert into public.user_roles(user_id, role) values (new.id, 'member');
  return new;
end $function$;

-- 2. One-time, race-safe admin bootstrap: only the very first caller can claim
--    the admin role, and only while no admin exists. An advisory transaction
--    lock makes concurrent first-signups safe. After the first admin exists,
--    only existing admins can grant admin via direct role management.
CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform pg_advisory_xact_lock(727272);
  if exists (select 1 from public.user_roles where role = 'admin') then
    return false;
  end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'admin')
  on conflict (user_id, role) do nothing;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'bootstrap_admin', 'user_role', auth.uid(), 'First administrator claimed via one-time bootstrap');
  return true;
end $function$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_admin() FROM anon;