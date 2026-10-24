-- Superadmin-only member directory for the Members screen.
-- Returns every profile with its roles; avoids a broad SELECT policy on profiles.
CREATE OR REPLACE FUNCTION public.list_members()
RETURNS TABLE(user_id uuid, display_name text, account_status text, roles app_role[], created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select p.user_id, p.display_name, p.account_status,
         coalesce(array_agg(r.role) filter (where r.role is not null), '{}'),
         p.created_at
  from public.profiles p
  left join public.user_roles r on r.user_id = p.user_id
  where exists (select 1 from public.user_roles s where s.user_id = auth.uid() and s.role = 'superadmin')
  group by p.user_id, p.display_name, p.account_status, p.created_at
  order by p.created_at
$$;

REVOKE EXECUTE ON FUNCTION public.list_members() FROM anon;