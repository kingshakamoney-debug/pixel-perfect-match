CREATE OR REPLACE FUNCTION public.log_admin_action(_action text, _entity_type text, _entity_id uuid DEFAULT NULL, _reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), _action, _entity_type, _entity_id, _reason);
end $$;