REVOKE EXECUTE ON FUNCTION public.get_entitlement(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_premium(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;