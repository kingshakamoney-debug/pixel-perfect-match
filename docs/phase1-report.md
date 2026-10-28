# Phase 1 Report — Free Historical Archive, Integrity, Privacy Fix

Date: 2026-10-28

## Files changed / created
- Migration `drizzle/migrations/0014_phase1_archive_integrity_privacy.sql`
- `src/lib/archive.ts`, `src/lib/archive.test.ts`
- `src/routes/archive.index.tsx` (`/archive`), `src/routes/archive.$game.tsx` (`/archive/<game>?year=&page=`)
- `src/components/site-header.tsx` (Results link), `src/routes/_authenticated/admin/index.tsx` (Results Centre now calls `submit_result`)
- `docs/tests/phase1-db-regression.sql`, `AGENTS.md`, `roadmap.md`

## Subscription privacy issue
**Cause:** `get_entitlement(_user_id)` and `has_premium(_user_id)` are security-definer functions executable by every signed-in user, and they accepted any user id. A member could call them with another member's id and learn plan status, trial status and expiry.
**Fix:** `get_entitlement` now raises `Forbidden` unless `_user_id = auth.uid()` or the caller is an admin; `has_premium` returns `false` for anyone else's id. Forecast RLS (`can_view_forecast_numbers`) always passes `auth.uid()`, so premium gating is unchanged.

## Integrity changes
- Partial unique indexes: at most one `pending` and one `verified` result per draw. The existing unique constraint `(game_id, scheduled_at)` already stops duplicate draws.
- `validate_result_number`: bonus numbers rejected unless the game defines `bonus_number_rules` `{"count","min","max"}`; bonus range and count enforced.
- `verify_result`: requires the exact bonus count and an `http(s)` source link.
- New `submit_result` RPC does the whole save atomically (rejects repeated numbers and future draws, marks any stale pending attempt `invalid` rather than deleting, then verifies and scores). Corrections still supersede the previous result and need a reason.
- Index `draws(game_id, scheduled_at desc, id desc)` for archive paging; `archive_years(game_id)` RPC gives the years that have data, using the game's timezone.

## Existing data conflicts
None. Checked: duplicate pending/verified results per draw, out-of-range numbers, verified results with the wrong count, bonus rows. All zero. There is only 1 draw in the database, and it's scheduled for the future.

## Tests and actual results
| # | Check | Result |
|---|---|---|
| 1 | Visitor browses `/archive` and a game page signed out (mobile 390px) | Pass (Playwright, no page errors) |
| 2 | Filters combine (game + year + page in URL) | Pass, by code review and unit tests. Year chips only appear once past draws exist. |
| 3 | Beyond 200 draws | `pageRange(5)` = rows 200–249, and the total comes from an exact count (unit test). **Not exercised against 200+ real rows.** No such data exists. |
| 4 | Invalid filters (`?year=abc&page=-4`, unknown game) | Pass. These fall back to page 1 or show the not-found message. |
| 5 | Duplicate draw / two pending results | Pass. Both are rejected by the unique constraints. |
| 6 | Range, repeats, count, disallowed bonus | Pass. Each gets a specific error message. |
| 7 | Correction keeps history | Pass. Statuses go `superseded,verified`, and the audit log records `verify,verify_correction`. |
| 8 | Member reads another member's entitlement | Pass. The call returns `Forbidden`, `has_premium` returns false, and the member sees 0 of other members' subscriptions and payments. |
| 9 | Member reads receipts or calls admin actions | Pass. They see 0 receipt files, and `approve_payment` and `submit_result` return `Forbidden`. |
| 10 | Admin can still read entitlements and approve payments | Admin entitlement read passes, and `approve_payment` is unchanged. A live approval was **not re-run** in this phase. |
| 11 | Scoring and performance | Scoring runs inside `verify_result` (used in #7). The full Vitest suite passes. |
| 12 | `bunx vitest run` → 35/35 pass. `bun run build` → succeeds. Type check is clean. |

All database checks ran as the `authenticated` role with that user's sign-in details, inside rolled-back transactions. No data was changed.

## Remaining issues
- The public read of `draw_results` returns `submitted_by` and `verified_by` user IDs if someone queries the table directly. The archive page doesn't request them. Consider a column-limited view in a later phase.
- `has_role` still lets a signed-in user check another user's role. This doesn't affect subscriptions, but it should be tightened later.
- Results Centre has no bonus-number input yet. No current game uses bonus numbers.
- The archive pages render in the browser rather than on the server. Search engines that don't run scripts will see only the page titles and descriptions.
