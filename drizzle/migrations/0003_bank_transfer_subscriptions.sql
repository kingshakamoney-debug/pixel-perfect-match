-- Configurable subscription plans
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_months integer NOT NULL CHECK (duration_months > 0),
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read plans" ON public.subscription_plans FOR SELECT TO authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin write plans" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Example plans (admin edits prices/details in Admin > Settings)
INSERT INTO public.subscription_plans (name, duration_months, price, currency, sort_order) VALUES
  ('1 month', 1, 5000, 'NGN', 1),
  ('3 months', 3, 13500, 'NGN', 2),
  ('6 months', 6, 25000, 'NGN', 3),
  ('12 months', 12, 45000, 'NGN', 4);

-- Single-row bank/payment configuration
CREATE TABLE public.payment_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bank_name text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  reminder_days integer[] NOT NULL DEFAULT '{7,3,1,0}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read payment settings" ON public.payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write payment settings" ON public.payment_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.payment_settings (id) VALUES (1);

-- Customer payment requests (manual bank transfer evidence)
CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans(id),
  claimed_amount numeric(12,2) NOT NULL CHECK (claimed_amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  transfer_date date NOT NULL,
  transfer_reference text NOT NULL,
  description text,
  receipt_path text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  verified_amount numeric(12,2),
  verified_currency text,
  verified_reference text,
  granted_months integer,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_requests_user_idx ON public.payment_requests (user_id, created_at DESC);
CREATE INDEX payment_requests_status_idx ON public.payment_requests (status) WHERE status = 'pending_review';
-- The same verified bank transaction can never approve two requests
CREATE UNIQUE INDEX payment_requests_verified_ref_unique ON public.payment_requests (lower(trim(verified_reference))) WHERE status = 'approved' AND verified_reference IS NOT NULL;
GRANT SELECT, INSERT ON public.payment_requests TO authenticated;
GRANT UPDATE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own requests read" ON public.payment_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own request insert" ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending_review');
CREATE POLICY "admin update requests" ON public.payment_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Renewal reminder delivery records (unique key prevents duplicate sends)
CREATE TABLE public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  reminder_key text NOT NULL UNIQUE,
  days_before integer NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reminder_logs TO authenticated;
GRANT ALL ON public.reminder_logs TO service_role;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminders read" ON public.reminder_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = reminder_logs.subscription_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- Atomic, idempotent payment approval: marks request approved AND activates/extends subscription
CREATE OR REPLACE FUNCTION public.approve_payment(_request_id uuid, _verified_amount numeric, _currency text, _months integer, _reference text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare r record; s record; p record; v_start timestamptz; v_end timestamptz;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  if _verified_amount is null or _verified_amount <= 0 then raise exception 'Verified amount must be positive'; end if;
  if _months is null or _months <= 0 then raise exception 'Granted duration must be at least 1 month'; end if;
  if coalesce(trim(_reference), '') = '' then raise exception 'Verified bank transaction reference is required'; end if;
  select * into r from payment_requests where id = _request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if r.status = 'approved' then return; end if; -- idempotent: repeated approvals are no-ops
  if r.status <> 'pending_review' then raise exception 'Only pending requests can be approved'; end if;
  if exists (select 1 from payment_requests where status = 'approved' and lower(trim(verified_reference)) = lower(trim(_reference))) then
    raise exception 'This bank transaction reference has already been used for an approved payment';
  end if;
  select * into p from subscription_plans where id = r.plan_id;
  -- Renew early: extend from current expiry. New or expired: start now.
  select * into s from subscriptions
    where user_id = r.user_id and status in ('active','past_due','cancelled') and current_period_end > now()
    order by current_period_end desc limit 1;
  v_start := coalesce(s.current_period_end, now());
  v_end := v_start + make_interval(months => _months);
  insert into subscriptions (user_id, provider_name, plan_code, status, current_period_start, current_period_end)
    values (r.user_id, 'bank_transfer', coalesce(p.name, _months || ' month(s)'), 'active', v_start, v_end);
  update payment_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
    verified_amount = _verified_amount, verified_currency = _currency, verified_reference = trim(_reference), granted_months = _months
    where id = r.id;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, reason, after_data)
    values (auth.uid(), 'approve_payment', 'payment_request', r.id,
      'Verified ' || _verified_amount || ' ' || _currency || ' · granted ' || _months || ' month(s)',
      jsonb_build_object('user_id', r.user_id, 'period_start', v_start, 'period_end', v_end, 'reference', trim(_reference)));
end $function$;

-- Payment rejection with mandatory reason
CREATE OR REPLACE FUNCTION public.reject_payment(_request_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'A rejection reason is required'; end if;
  select * into r from payment_requests where id = _request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if r.status <> 'pending_review' then raise exception 'Only pending requests can be rejected'; end if;
  update payment_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = trim(_reason)
    where id = r.id;
  insert into audit_logs (actor_user_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'reject_payment', 'payment_request', r.id, trim(_reason));
end $function$;

-- Private receipt storage: owner uploads/reads own folder, admins read all
CREATE POLICY "receipt upload own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "receipt read own or admin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));