<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Country, provider and game creation lives on the admin-only Games page using RLS; countries link to providers and games inherit country through their provider, with creation invalidating shared queries. Why: setup follows country → provider → game without duplicating country data or exposing configuration to subadmins.

- Account handles are normalized, unique and immutable in Postgres; signup sends handle metadata and email remains the credential. Legacy/social accounts get generated handles to preserve existing sign-in and avoid deriving handles from private emails. Why: referral attribution needs a stable identity and browser-only uniqueness checks can race.

- Business rules (forecast publishing, cutoffs, result verification, scoring, entitlement) live in Postgres security-definer RPCs and RLS; the UI only calls them. Why: browser checks are bypassable.
- Premium forecast numbers are hidden by RLS (`can_view_forecast_numbers`) until the draw's result is verified or the viewer is entitled. Why: never leak future forecasts.
- Published forecasts and verified results are never edited in place; corrections create a new version and supersede the old one with an audit log. Why: auditable history.
- Pure scoring/validation helpers live in `src/lib/stats.ts` and `src/components/admin/helpers.ts` with vitest tests beside them.
- Roles: member < subadmin < admin < superadmin. `has_role(uid,'admin')` is satisfied by superadmin; `can_manage_content(uid)` (admin, superadmin, or subadmin) gates forecast/result work. Subadmins can post forecasts and enter results only — no payments, settings, or member management (enforced by RLS/RPCs, and the Payments/Settings pages also guard client-side). Signups start as members; the first superadmin is claimed once via the race-safe `bootstrap_admin()` RPC. Only a superadmin can grant/revoke `admin`/`subadmin` via `grant_role`/`revoke_role`; superadmin itself is bootstrap-only and can never be granted or revoked through the API. Why: automatic first-signup promotion let any first registrant silently become admin, and role changes must be auditable.
- Bank-transfer memberships: customers submit evidence into `payment_requests` (private `payment-evidence` bucket, owner-folder RLS); only the admin-gated `approve_payment`/`reject_payment` RPCs change status, and `approve_payment` atomically creates the `subscriptions` row (provider_name='bank_transfer'), extending from the current expiry on early renewals. Why: a client-supplied amount or upload must never activate access, and approval must be idempotent (unique index on normalized verified reference).
- Renewal reminders are recorded by the managed daily cron route `/api/public/jobs/renewal-reminders` into `reminder_logs` (unique key = subscription + expiry + days_before); only the latest-expiry subscription per user is considered so early renewals suppress old reminders. No email provider is configured — reminders surface in the dashboard, and reminder_logs is the trail a future sender picks up.
