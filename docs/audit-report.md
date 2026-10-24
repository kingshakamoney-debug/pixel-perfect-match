# LottoWizard — Application Audit and Hardening Report

Date: 2026-10-24
Scope: existing application audit per the "Existing Application Audit and Hardening" brief. No rebuild, no billing/referrals/wallets/staking added.

---

## 1. Existing database tables and relationships

Sixteen tables, all in the `public` schema, all with Row Level Security enabled:

| Table | Purpose | Key relationships |
|---|---|---|
| `profiles` | Display name, account status | `user_id → auth.users` |
| `user_roles` | Role assignments (`admin`, `member`) | `user_id → auth.users`; `UNIQUE(user_id, role)` |
| `audit_logs` | Immutable action log (publish, verify, corrections, bootstrap) | actor → user |
| `providers` | Lottery operators (Ghana NLA, Golden Chance) | — |
| `games` | Per-game rules: number range, count drawn, count per combination, match threshold | `provider_id → providers` |
| `draw_schedules` | Recurrence config + local draw time per game | `game_id → games` |
| `draws` | Scheduled draws with publication cutoff | `game_id → games` |
| `forecasts` | Draft/published/superseded versions with correction reason | `draw_id → draws`; `supersedes_forecast_id → forecasts` |
| `forecast_combinations` | One row per predicted line | `forecast_id → forecasts` |
| `forecast_numbers` | Individual numbers per line | `combination_id → forecast_combinations` |
| `draw_results` | Pending/verified/superseded results with source link | `draw_id → draws` |
| `result_numbers` | Winning numbers per result | `result_id → draw_results` |
| `forecast_scores` | Hit counts per combination per result | → forecasts, combinations, results; `UNIQUE(combination_id, result_id)` |
| `subscriptions` | Paystack subscription state | `user_id` |
| `trial_grants` | 3-day trial windows | `user_id` |
| `payment_events` | Webhook event log (no client access at all) | — |

Eleven database functions enforce the business rules server-side: `has_role`, `has_premium`, `get_entitlement`, `can_view_forecast_numbers`, `publish_forecast`, `create_forecast_correction`, `verify_result`, `score_result`, `bootstrap_admin`, plus triggers `handle_new_user`, `protect_profile`, `validate_forecast_number`, `validate_result_number`.

## 2. RLS and authorization findings

**Sound:**
- Every table has RLS enabled; no table is policy-less by accident (`payment_events` is intentionally fully denied to clients — webhook/server only).
- Forecast numbers and combinations are hidden by `can_view_forecast_numbers` until the draw's result is verified OR the viewer is entitled (admin, active subscription, or active trial). Anonymous and unpaid users cannot read future numbers through any direct query.
- Admin writes (draws, games, forecasts, results) all require `has_role(auth.uid(), 'admin')` in the policy itself — direct API calls from non-admins are rejected by the database, not just hidden in the UI.
- Draft forecasts are writable only while `status IN ('draft','scheduled')`; published rows cannot be edited in place.
- Profiles: users read/update only their own row; `account_status` changes are blocked for non-admins by the `protect_profile` trigger.
- Subscriptions, trials, roles: read-own (or admin) only; no client inserts/updates — they are written by server-side flows.

**Fixed during this audit:**
- `get_entitlement`, `has_premium`, `has_role` were executable by anonymous callers, letting anyone probe any user's entitlement/role by ID. `EXECUTE` is now revoked from anonymous callers; signed-in users keep access, and internal use inside RLS policies is unaffected.

**Accepted as intentional (info-level):**
- `draw_schedules`, `draws`, and `forecast_scores` are publicly readable — that is the product's open-track-record design.
- Security-definer functions remain callable by signed-in users because the UI calls them directly (`publish_forecast`, `verify_result`, etc.); each re-checks `has_role` internally, so the call is safe even though it is exposed.

## 3. Forecast and scoring test results

Automated suite: **11 tests, 3 files, all passing.**

- `src/lib/stats.test.ts` (6): hit counting including zero hits and disjoint sets; the 2+ threshold — exactly 2 hits succeeds, 0 and 1 fail, 3+ succeed; combination success rate vs draw success rate are computed with separate denominators; empty score sets yield null rates, never divide-by-zero.
- `src/components/admin/helpers.test.ts` (4): combination parsing/validation — duplicates rejected, out-of-range rejected (below 1 / above 90), wrong count rejected, valid 5-of-90 accepted.
- `src/test/app-routing.test.tsx` (1): app shell renders.

Backend enforcement verified by code inspection and live exercise:
- Number range and per-line count are enforced again by database triggers (`validate_forecast_number`, `validate_result_number`) — the UI checks are a convenience, not the boundary.
- `publish_forecast` rejects publishing after the draw's cutoff, rejects empty drafts, and enforces the single-set one-line rule.
- `verify_result` requires exactly the game's `numbers_drawn` winning numbers plus an official source link; only verified results are scored (`score_result` reads `status = 'verified'` only).
- Result corrections supersede the old result, delete its scores, and rescore — no duplicate score records (also guaranteed by `UNIQUE(combination_id, result_id)` with upsert).
- Public Performance/History pages read `forecast_scores` and verified draws directly from the database — real records, real denominators.

## 4. Admin bootstrap security findings

**Critical defect found and fixed.** The original `handle_new_user` trigger promoted the *first account ever created* to administrator automatically. Anyone who registered first — including an attacker on a freshly deployed instance — silently became admin.

**Fix applied:**
- The trigger now always assigns only the `member` role. No automatic admin promotion exists anywhere.
- A new one-time, race-safe `bootstrap_admin()` function handles the first admin: it takes a transaction-level advisory lock, succeeds only while zero admins exist, records the event in the audit log, and is callable only by signed-in users. Concurrent claims cannot both win.
- The Admin page now shows a "Claim administrator role" panel when no administrator exists, instead of a dead-end message.
- Self-promotion after bootstrap is impossible: `user_roles` has no client insert/update policy at all.

**Verified end-to-end in the live preview:** created a fresh account, opened the Admin page, clicked "Claim administrator role", and the full admin area (Draws, Forecast Studio, Results Centre, Audit log) opened. Database confirms exactly 1 admin.

## 5. Public/private access test results

Exercised in the browser, signed out and signed in:

- **Signed out:** Home, History, and Performance load fully; Forecasts/Admin links hidden; `/dashboard` and `/admin` redirect to sign-in. Upcoming forecast numbers return zero rows for anonymous callers (RLS).
- **Signed in, unpaid:** Dashboard opens with "No active membership — Premium forecasts are locked"; past forecasts remain free on History. Correct per the entitlement rules.
- **Signed in as admin:** all four admin tabs functional; draw creation, forecast drafting/publishing, result verification, and audit log all exercised.
- **Public pages leak no private data:** History/Performance expose only game names, draw times, forecast numbers (post-verification), scores, and source links — no user IDs, emails, or display names.
- Email sign-up works and correctly requires email confirmation before a session is issued.

## 6. Missing functionality and integration dependencies

Not yet built (deliberately deferred per the brief):
1. **Paystack membership payments** — `subscriptions` and `payment_events` tables exist; needs the Paystack webhook endpoint and checkout flow. Dependency: Paystack secret keys.
2. **3-day free trial with verified email AND verified phone** — `trial_grants` exists and `get_entitlement` honors it, but there is no phone verification flow. Dependency: an SMS provider (not yet chosen).
3. **Recurring draw generation** — `draw_schedules` stores recurrence rules, but no scheduler creates draws from them yet (brief: do not auto-generate until scheduling rules are configured and tested). Dependency: a scheduled job.
4. **Admin member management** — suspend accounts, view trial/verification status.
5. **Email confirmation UX polish** — the post-signup "check your email" state works but is plain.

## 7. Prioritized fixes

**Done this phase (critical/high):**
1. ✅ CRITICAL — removed automatic first-signup admin promotion; replaced with race-safe one-time `bootstrap_admin()` + audit log entry.
2. ✅ HIGH — revoked anonymous execution of `get_entitlement` / `has_premium` / `has_role` (stopped anonymous entitlement/role probing).
3. ✅ Added scoring tests for zero-hit, one-hit, and multi-hit cases.

**Recommended next phase (in order):**
1. Paystack webhook + checkout so memberships can activate (unlocks the premium tier the RLS already enforces).
2. Choose an SMS provider and build phone verification, then enable the 3-day trial grant flow.
3. Draw scheduler that materializes draws from `draw_schedules`, once recurrence rules are configured per game.
4. Admin member-management screen (suspend/unsuspend, entitlement overview).
5. Referral programme, wallet, and "Admin Stake for Me" — explicitly out of scope until the above are live.

---

*Data preserved throughout: all changes were additive migrations; no tables, columns, or rows were dropped.*
