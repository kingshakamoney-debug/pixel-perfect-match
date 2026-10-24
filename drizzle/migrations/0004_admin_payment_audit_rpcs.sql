-- Admin-gated audit logging for settings changes (audit_logs has no client INSERT policy)
CREATE OR REPLACE FUNCTION public.log_admin_action(_action text, _entity_type text, _entity_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), _action, _entity_type, _entity_id, _reason);
end $function$;

-- Correct a subscription's expiry with a mandatory reason and audit trail
CREATE OR REPLACE FUNCTION public.correct_subscription(_subscription_id uuid, _new_end timestamptz, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare s record;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'A reason is required'; end if;
  if _new_end is null then raise exception 'New expiry is required'; end if;
  select * into s from subscriptions where id = _subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  update subscriptions set current_period_end = _new_end, updated_at = now() where id = s.id;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, reason, before_data, after_data)
    values (auth.uid(), 'correct_subscription', 'subscription', s.id, trim(_reason),
      jsonb_build_object('current_period_end', s.current_period_end),
      jsonb_build_object('current_period_end', _new_end));
end $function$;