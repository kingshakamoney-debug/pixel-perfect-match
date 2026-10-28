# LottoWizard — Historical Archive & Search Expansion: Current-State Audit

Date: 2026-10-28 · Read-only audit; no code, data, migrations or configuration were changed. No secrets are included.

Legend: **[V]** verified in code/migrations/live schema · **[A]** assumption or inference.

---

## 1. Current architecture

| Area | Finding |
|---|---|
| Frontend | React 19 + TanStack Start v1 (file routes in `src/routes`), Vite 7, Tailwind v4, shadcn/ui, TanStack Query. [V] |
| Routing | Public: `/`, `/history`, `/performance`, `/auth`. Signed-in (`_authenticated`): `/dashboard`, `/subscription`, `/admin` (Operations), `/admin/games`, `/admin/payments`, `/admin/settings`, `/admin/members`. [V] |
| Database | Lovable Cloud Postgres; migrations `drizzle/migrations/0000`–`0013` (plain SQL). RLS on every public table. [V] |
| Auth | Email + password (email confirmation required) and Google. Unique immutable handle per profile. Roles in `user_roles` (member < subadmin < admin < superadmin). [V] |
| Server logic | Business rules are Postgres security-definer RPCs called directly from the browser. No `createServerFn` functions exist yet. [V] |
| Scheduled jobs | One cron route: `src/routes/api/public/jobs/renewal-reminders.ts` (daily 08:00 UTC, cron-secret checked via `cron-auth.ts`). [V] |
| Storage | One private bucket, `payment-evidence`, with owner-folder RLS. [V] |
| Deployment | Edge worker (Cloudflare-style runtime); one backend serves preview and published site. [V] |

## 2. Database inventory (relevant tables)

| Domain | Tables | Key constraints / indexes [V] | Reuse? |
|---|---|---|---|
| Countries/providers | `countries`, `providers` | `countries.code` unique 2-letter; `providers.slug` unique; `providers_country_id_idx`; trigger `require_provider_country` | Reuse as-is |
| Games & rules | `games` | `slug` unique; index on `provider_id`; min/max number, numbers_drawn, numbers_per_combination, min_match_threshold, `bonus_number_rules` jsonb | Reuse as-is |
| Schedules & draws | `draw_schedules`, `draws` | `draws UNIQUE(game_id, scheduled_at)`; index on `scheduled_at`; trigger `protect_draw_schedule_history` | Reuse — `draws` doubles as the historical draw record |
| Results | `draw_results`, `result_numbers` | status `pending/verified/superseded/invalid`; `source_url`, `version`, `correction_reason`; index on `draw_id`; `result_numbers UNIQUE(result_id, number_value, number_type)`; triggers `validate_result_number`; RPC `verify_result` | Reuse — already versioned with provenance |
| Forecasts/scoring | `forecasts`, `forecast_combinations`, `forecast_numbers`, `forecast_scores` | `UNIQUE(combination_id, result_id)`; RPCs `publish_forecast`, `create_forecast_correction`, `score_result`; `can_view_forecast_numbers` | Unchanged |
| Plans/subs/trials | `subscription_plans`, `subscriptions`, `trial_grants`, `payment_requests`, `payment_settings`, `reminder_logs`, `payment_events` | `approve_payment` / `reject_payment` / `correct_subscription`; unique normalized verified reference; `get_entitlement`, `has_premium` | Reuse; needs a tier dimension |
| Roles/audit | `user_roles`, `audit_logs` | `has_role`, `can_manage_content`, `log_admin_action` | Reuse as-is |

## 3. Historical results — schema fit

| Requirement | Status | Notes |
|---|---|---|
| Multiple years & providers | **Supported** [V] | `draws.scheduled_at` is a timestamp; no date limits. |
| Multiple games per provider | **Supported** [V] | `games.provider_id` FK. |
| Game-specific ranges/rules | **Supported** [V] | Enforced by `validate_result_number` trigger and `verify_result` (exact `numbers_drawn`). |
| Bonus numbers | **Partial** [V] | `number_type='bonus'` exists, but bonus count/range rules in `bonus_number_rules` are not enforced. |
| Historical imports | **Missing** [V] | No import tables, UI, or bulk RPC. Only one-at-a-time result entry in Results Centre. |
| Duplicate detection | **Partial** [V] | `UNIQUE(game_id, scheduled_at)` prevents duplicate draws; nothing prevents two pending results per draw. |
| Source URL & verification | **Supported** [V] | `verify_result` requires `source_url`; status workflow exists. Only one free-text URL — no source type / retrieval date. |
| Corrections & audit trail | **Supported** [V] | Re-verifying supersedes previous result, rescores, writes `audit_logs`. |
| Efficient provider/game/year filter | **Partial** [V] | Index on `draws(scheduled_at)` only; no composite `(game_id, scheduled_at)` beyond the unique constraint (which does serve this — [A] Postgres will use it). No index on `result_numbers(number_value)` for search. |
| Back-dated draws | **Risk** [V] | `publication_cutoff_at` is NOT NULL and `protect_draw_schedule_history` blocks edits after verification; imports must set a cutoff (e.g. = draw time). `verify_result` also calls `score_result` — harmless when no forecasts exist. |

**Minimum changes:** composite search indexes, an import-batch/staging pair of tables, a bulk import RPC, and optional provenance columns on `draw_results` (`import_batch_id`, `source_type`). No duplicate results table is needed.

## 4. Subscription & entitlement

**How it works today [V]:** `approve_payment` inserts a `subscriptions` row (`provider_name='bank_transfer'`, `plan_code` = plan *name* text, period from current expiry or now, calendar months). `get_entitlement(uid)` returns `allowed` for admins, any active subscription, or an active trial; `has_premium` wraps it. The only premium gate in RLS is `can_view_forecast_numbers`. Entitlement is a single boolean — there is **no tier concept**.

**Gap:** `subscription_plans` has no tier column, and `subscriptions.plan_code` stores a display name, so the backend cannot tell Search from Search + Forecast.

**Recommended design (minimal, backward-compatible):**
1. Add `subscription_plans.tier text NOT NULL DEFAULT 'search_forecast'` (check `search`, `search_forecast`) — existing plans keep forecast access.
2. Add `subscriptions.tier text NOT NULL DEFAULT 'search_forecast'`; `approve_payment` copies the plan's tier (same atomic transaction, same expiry logic).
3. Add `has_feature(uid, feature)` (`'search'` | `'forecast'`): admin → both; active sub → by tier (`search_forecast` grants both); trial → [decision needed] which tier a trial grants.
4. Change `can_view_forecast_numbers` to use `has_feature(..., 'forecast')`. Keep `has_premium`/`get_entitlement` signatures working (return tier as an extra column via a new function rather than altering the existing return type).
5. Early renewal across tiers: [decision needed] — current logic stacks periods; mixing tiers needs a rule (e.g. upgrade starts now, or tiers stack independently).

## 5. Search & analytics

| Capability | Status [V] |
|---|---|
| Number search | Missing |
| Date filtering | Partial — `/history` filters by game only, capped at 200 rows, verified draws only |
| Frequency, last-appearance, co-occurrence | Missing |
| Reusable pieces | `fetchHistory`, `fetchScores` (`src/lib/data.ts`), `GameFilter`, `Balls`, `countHits`/`computePerformance` (`src/lib/stats.ts`), Recharts on `/performance` |

**Recommendation:** implement search/analytics as security-definer SQL functions (`search_numbers`, `number_frequency`, `last_appearance`, `co_occurrence`) that first check `has_feature(auth.uid(),'search')` and compute only from `verified` results. Needs index `result_numbers(number_value, result_id)` and `draw_results(draw_id) WHERE status='verified'`. Note `result_numbers` is publicly readable for verified results, so a determined user could compute stats client-side; the paid value is the tooling, not data secrecy [A — product decision].

## 6. Admin tools & import

Existing [V]: country/provider/game/draw CRUD (admin), Forecast Studio and Results Centre (admin + subadmin), audit log viewer, payments, members.

Minimum additions:
- `import_batches` (id, game_id, source_url, source_type, file name, row counts, status `uploaded/validated/published/failed`, created_by) and `import_rows` (batch_id, row_no, raw jsonb, parsed draw date, numbers, error text, status).
- Admin "Import" page: CSV upload → client parse → insert rows → `validate_import_batch` RPC (range/count/duplicate vs existing draws and within file) → preview with failed-row report/CSV download → `publish_import_batch` RPC creating draws + verified results in one transaction, audit-logged.
- Decide whether subadmins may import (current rule: subadmins enter results → [A] allow validate, restrict publish to admin).

## 7. Security & performance findings

- Public reads of verified results, draws, active games/providers contain no customer data [V]. Unverified/pending results hidden by RLS [V].
- Payment, subscription, trial and reminder rows are owner-or-admin only; `payment_events` fully denied [V].
- `get_entitlement(_user_id)` is callable by any signed-in user for **any** user id [V] — leaks another member's plan status. Recommend restricting to `auth.uid()` or admin.
- `/history` fetches nested forecasts/results in one query, limit 200 [V]; a multi-year archive needs server-side pagination by year and the composite indexes above.
- Search RPCs must enforce entitlement inside the function; UI hiding is not a boundary.

## 8. Tests & risks

Existing tests [V]: `stats.test.ts`, `helpers.test.ts`, `game-schema.test.ts`, `provider-schema.test.ts`, `draw-time.test.ts`, `handles.test.ts`, `subscription.test.ts`, `app-routing.test.tsx`. No database-level tests.

Missing coverage: entitlement by tier, CSV parsing/validation, duplicate detection, frequency/co-occurrence maths.

Risks: altering `get_entitlement` return type breaks existing callers; tier defaults must preserve current paying members; bulk verified inserts bypass `verify_result` unless the import RPC reuses its checks; `protect_draw_schedule_history` will block correcting imported draw times.

---

## Deliverables summary

1. **Confirmed:** multi-country/provider/game schema, per-game rules, versioned results with source URL, corrections with audit, bank-transfer subscriptions, entitlement-gated forecasts.
2. **Partial:** history browsing (game filter only), duplicate prevention, bonus rules, provenance detail.
3. **Missing:** imports, tiered entitlements, number search & analytics, year/country browsing.
4. **Relevant files:** `src/lib/data.ts`, `src/lib/stats.ts`, `src/lib/auth.ts`, `src/routes/history.tsx`, `src/routes/_authenticated/admin/index.tsx`, `.../admin/payments.tsx`, `.../admin/settings.tsx`, `.../subscription.tsx`, migrations `0000`, `0003`, `0009`, `0013`.
5. **Security/perf:** see §7.
6. **Schema changes:** tier columns (§4), `has_feature`, import tables (§6), indexes on `result_numbers(number_value, result_id)` and partial `draw_results(draw_id) WHERE status='verified'`, optional `draw_results.import_batch_id/source_type`.

### 7. Implementation sequence

| Phase | Work | Depends on |
|---|---|---|
| 1 | Public archive: country → provider → game → year browsing with pagination; indexes | — |
| 2 | Import pipeline (tables, validate/publish RPCs, admin page) | 1 |
| 3 | Tiers: plan/subscription tier columns, `has_feature`, update forecast gate, plan UI | — (parallel with 2) |
| 4 | Search & analytics RPCs + Search page | 1, 3 |
| 5 | Hardening: restrict `get_entitlement` to self/admin, DB tests | 3 |

### 8. Acceptance tests

- **P1:** signed-out visitor filters Ghana → NLA → National → 2024 and sees only verified draws; no forecasts numbers for unverified draws; page with 1,000+ draws paginates.
- **P2:** CSV with a duplicate date, an out-of-range number and a wrong count reports 3 failed rows; valid rows publish as verified with source and batch id; re-importing the same file creates 0 new draws; audit log records the publish.
- **P3:** existing paid member keeps forecast access after migration; Search-only member can search but cannot read upcoming forecast numbers; Search + Forecast gets both; early renewal still extends from current expiry.
- **P4:** frequency/last-appearance/co-occurrence for a seeded dataset match hand-computed values; free user calling the RPC gets "Forbidden"; superseded results are excluded.
- **P5:** a member calling `get_entitlement` with another user's id gets no data.
