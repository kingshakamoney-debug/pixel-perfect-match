-- Phase 1 database regression checks. Run as a privileged SQL session; everything is rolled back.
-- Replace MEMBER / ADMIN with a plain member id and an admin id. Every row in _r must show the expected error text.
begin;
create temp table _r(k text, v text); grant all on _r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"MEMBER","role":"authenticated"}', true);
do $$ begin perform public.get_entitlement('ADMIN'); insert into _r values('member_reads_other','LEAK');
exception when others then insert into _r values('member_reads_other', sqlerrm); end $$;      -- expect Forbidden
do $$ begin insert into _r values('member_premium_probe', public.has_premium('ADMIN')::text); end $$; -- expect false
do $$ begin perform public.approve_payment(gen_random_uuid(),1,'GHS',1,'x'); exception when others then insert into _r values('member_approve', sqlerrm); end $$; -- Forbidden
do $$ begin insert into _r values('member_other_subs', (select count(*) from subscriptions where user_id <> auth.uid())::text); end $$; -- 0
select * from _r;
rollback;
