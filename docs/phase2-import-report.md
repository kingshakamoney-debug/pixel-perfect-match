# Phase 2 — Historical import (Golden Chance Morning-dew)

## What was built
- **Parser** `src/lib/import-morning-dew.ts`: accepts copied site text (`0671: 01/01/2026: 3202891188 | 1013692163`) and CSV (`draw_number,date,group1,group2`). Draw numbers and numbers stay strings (leading zeros kept). Rejects bad dates, wrong digit counts, missing/extra `|`, missing groups, out-of-range or repeated numbers, duplicate draws/dates. Nothing is inferred or corrected. Title/footer lines not starting with a digit are ignored.
- **Admin → Import** page (admins only): choose game, source link, draw time (game timezone); paste → preview (source text, draw, date, both groups, status) → required "reviewed" tick → stage privately → publish → optional verify.
- **Database** (migration 0015): `draws.draw_number` (unique per game), private `import_batches` / `import_rows` (admin-read RLS, no direct writes), RPCs `stage_import` and `publish_import` (admin-only, security definer, every row revalidated on the server, conflicts with existing draws/results flagged, audit logged).
- **Publishing creates results as _pending_ (awaiting verification)**, never verified. Verification is a separate explicit action using the existing `verify_result` (which also scores forecasts).
- Idempotent: a published batch cannot republish; re-staging the same data marks every row as a conflict; existing results are never overwritten (corrections stay in Results Centre with a reason).
- Archive shows `#draw number`, two-digit padding (`09`) and machine/bonus numbers.
- Example file: `docs/import-examples/goldenchance_morning_dew_2026.txt`.

## Storage mapping (confirmed by Phase 2 follow-up)
- Group 1 → winning numbers (`regular`), Group 2 → machine numbers (`bonus`).
- Morning Dew configured with `bonus_number_rules = {count:5,min:1,max:90}`. Results Centre now asks for machine numbers on games with bonus rules.
- Stored as integers; display pads to two digits, so `09` round-trips. Original text kept in `import_rows.raw_text`.

## Scoring — unchanged
Scoring matches regular forecast numbers against Group 1 winning numbers only. The database configuration was checked: Morning Dew is 5/90, five numbers per combination, five machine numbers, and a 2+ winning-match success threshold. `score_result` filters both sides to `number_type='regular'`; machine matches never enter the existing score. No historical scores or other games were rescored.

Machine-number forecasts and separately labelled machine performance statistics are **not implemented** and remain a separate future enhancement. Independent helper tests demonstrate one winning match versus four machine matches for the same prediction; winning success remains false. Operator confirmation of the success threshold remains outstanding; the configured 2+ rule is retained, not represented as an official payout rule.

## Phase 2 follow-up — schedule, source and review safeguards
- Game defaults now store a configurable draw time and certainty. Morning Dew defaults to **11:15 Africa/Lagos, provisional**; the secondary-listing time has not been operator-confirmed. Admin Games can edit it, and new draw/import forms use it instead of 10:00.
- Existing imported draw timestamps remain at the original 10:00 Lagos placeholder; they are labelled provisional. Historical dates, number groups and results are not rewritten when the default changes. New draws snapshot schedule certainty rather than inheriting later edits.
- Official results reference corrected to https://goldenchancelotto.com/results/index.html. Original batch and result source URLs remain as provenance; no guessed original source is silently overwritten. The review link uses the corrected reference. Neither URL establishes record verification.
- Previous batches can be reopened. The bulk-verify action is removed; each pending record has its own source-check confirmation and Verify & score action.
- `review_import_result` atomically checks stored import groups against stored result groups, validates Morning Dew configuration and row values, records reviewer/time and an audit entry, then calls `verify_result`.
- A database verification-transition trigger rechecks counts, distinctness, ranges and group types. It rejects initial imported verification without individual review, including alternate direct `verify_result` / `submit_result` paths. Existing correction/version/audit behavior remains in place.

### Follow-up test outcomes
- 31 targeted tests passed across scoring, parser, game schedule validation, timezone conversion and archive helpers.
- Authenticated browser: reopened the actual published batch; 42 rows awaiting individual source review; Verify & score disabled until its record checkbox is checked.
- Authenticated backend: unchecked review rejected; calling `verify_result` directly on an unreviewed imported record rejected.
- Admin schedule changed to 11:16, saved and read back, then restored to provisional 11:15. Archive displays provisional historical times.
- No successful verification was performed on supplied records: none were checked against operator records during this change. Positive verification/scoring of those records intentionally remains untested until actual source review.
- Latest preview build: OK.
- Final database readback: 42 imported rows, 42 pending, zero verified, zero reviewed, zero changed dates, zero changed original times and zero changed source provenance; Morning Dew has zero forecast scores.

### Remaining uncertainties
Operator-confirmed draw time and record-by-record source review remain outstanding. The official URL supplied by the user is a reference, not proof of any individual result. No unrelated feature work or machine forecast implementation was started.

## Tests
`src/lib/import-morning-dew.test.ts` (10 tests): 0671, leading zeros in 0674/0688/0695, 0712 as latest date, whole-file count, CSV, malformed dates/lengths, missing separators/groups, range, duplicates. Server rules (permissions, conflicts, idempotency, audit) verified end-to-end in the browser: 42 rows staged and published as pending, one malformed row rejected, re-staging produced 42 conflicts, 2 audit entries.

## Data state
The 42 supplied 2026 draws (0671–0712, with the 0699–0708 gap as in the source) are in the archive as **awaiting verification**. Nothing was marked verified.
