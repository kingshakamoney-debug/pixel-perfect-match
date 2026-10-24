-- has_role: a superadmin satisfies every 'admin' check, so all existing
-- policies and RPCs that call has_role(..., 'admin') automatically include superadmins.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (role = _role or (_role = 'admin' and role = 'superadmin'))
  )
$$;

-- One-time bootstrap now claims SUPERADMIN (not admin), still race-safe.
CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform pg_advisory_xact_lock(727272);
  if exists (select 1 from public.user_roles where role = 'superadmin') then
    return false;
  end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'superadmin')
  on conflict (user_id, role) do nothing;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'bootstrap_superadmin', 'user_role', auth.uid(), 'First superadmin claimed via one-time bootstrap');
  return true;
end
$$;

-- Superadmin-only role management. Only 'admin' can be granted/revoked for now;
-- superadmin itself is bootstrap-only and cannot be granted or revoked through the API.
CREATE OR REPLACE FUNCTION public.grant_admin(_target_user uuid)
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
  insert into public.user_roles(user_id, role) values (_target_user, 'admin')
  on conflict (user_id, role) do nothing;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'grant_admin', 'user_role', _target_user, 'Admin role granted by superadmin');
end
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin(_target_user uuid)
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
  delete from public.user_roles where user_id = _target_user and role = 'admin';
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'revoke_admin', 'user_role', _target_user, 'Admin role revoked by superadmin');
end
$$;

-- Superadmins may read the role list (needed for the Members screen).
CREATE POLICY "superadmin read roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'superadmin'));

REVOKE EXECUTE ON FUNCTION public.grant_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_admin(uuid) FROM anon;