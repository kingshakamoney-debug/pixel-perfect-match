# Phase 2 — Historical import (Golden Chance Morning-dew)

## What was built
- **Parser** `src/lib/import-morning-dew.ts`: accepts copied site text (`0671: 01/01/2026: 3202891188 | 1013692163`) and CSV (`draw_number,date,group1,group2`). Draw numbers and numbers stay strings (leading zeros kept). Rejects bad dates, wrong digit counts, missing/extra `|`, missing groups, out-of-range or repeated numbers, duplicate draws/dates. Nothing is inferred or corrected. Title/footer lines not starting with a digit are ignored.
- **Admin → Import** page (admins only): choose game, source link, draw time (game timezone); paste → preview (source text, draw, date, both groups, status) → required "reviewed" tick → stage privately → publish → optional verify.
- **Database** (migration 0015): `draws.draw_number` (unique per game), private `import_batches` / `import_rows` (admin-read RLS, no direct writes), RPCs `stage_import` and `publish_import` (admin-only, security definer, every row revalidated on the server, conflicts with existing draws/results flagged, audit logged).
- **Publishing creates results as _pending_ (awaiting verification)**, never verified. Verification is a separate explicit action using the existing `verify_result` (which also scores forecasts).
- Idempotent: a published batch cannot republish; re-staging the same data marks every row as a conflict; existing results are never overwritten (corrections stay in Results Centre with a reason).
- Archive shows `#draw number`, two-digit padding (`09`) and machine/bonus numbers.
- Example file: `docs/import-examples/goldenchance_morning_dew_2026.txt`.

## Storage mapping (assumption — please confirm)
- Group 1 → winning numbers (`regular`), Group 2 → machine numbers (`bonus`).
- Morning Dew configured with `bonus_number_rules = {count:5,min:1,max:90}`. Results Centre now asks for machine numbers on games with bonus rules.
- Stored as integers; display pads to two digits, so `09` round-trips. Original text kept in `import_rows.raw_text`.

## Scoring — unchanged, open questions
Scoring still matches forecasts against Group 1 only with the game's existing 2+ threshold. Not verified from authoritative docs:
1. Are Group 2 (machine) numbers ever counted as hits?
2. Is the official draw time 10:00 Lagos? (Import uses the time entered by the admin.)
3. Is 2+ the right success threshold for Morning Dew?
4. Official source URL for provenance.

## Tests
`src/lib/import-morning-dew.test.ts` (10 tests): 0671, leading zeros in 0674/0688/0695, 0712 as latest date, whole-file count, CSV, malformed dates/lengths, missing separators/groups, range, duplicates. Server rules (permissions, conflicts, idempotency, audit) verified end-to-end in the browser: 42 rows staged and published as pending, one malformed row rejected, re-staging produced 42 conflicts, 2 audit entries.

## Data state
The 42 supplied 2026 draws (0671–0712, with the 0699–0708 gap as in the source) are in the archive as **awaiting verification**. Nothing was marked verified.
