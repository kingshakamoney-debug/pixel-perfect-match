# LottoWizard

**Lotto forecasts you can audit, draw by draw.**

LottoWizard publishes lotto number forecasts for African lotteries — starting with **Ghana NLA (National)** and **Golden Chance (Morning Dew)** — and scores every published forecast openly against the verified official result. Forecasts are timestamped before the draw, locked at a cutoff, and never edited after publication; corrections create a new, clearly marked version. Two or more matching numbers in a line counts as a hit.

> Forecasts are possibilities, not guarantees. Hit rates are not financial returns. Play responsibly, 18+.

---

## What the platform does

- **Public track record** — anyone can browse the full History and Performance pages: every verified draw, every published forecast, and the exact hit counts, with official source links.
- **Premium forecasts** — upcoming forecast numbers are visible only to members with an active subscription or trial, and to everyone once the draw's result is verified. The restriction is enforced by the database itself, not the UI.
- **Admin operations** — a back office for managing draws, composing single-set or multi-line forecasts, publishing before the cutoff, entering and verifying official results, and automatic scoring.
- **Immutable history** — published forecasts and verified results are never overwritten. Corrections supersede the old version, keep the original, record a reason, and are written to an audit log.

## Tech stack

- **Frontend:** React 19, TanStack Start (SSR), TanStack Router/Query, Tailwind CSS v4, shadcn/ui, Recharts
- **Backend:** Lovable Cloud (Postgres + Auth) — all business rules live in database functions and row-level security policies
- **Tests:** Vitest (scoring and validation rules)
- **Type safety:** end-to-end generated database types

## Architecture principles

1. **Browser checks are bypassable, so there are none that matter.** Publishing cutoffs, number validation, result verification, scoring, and entitlement are all enforced by security-definer database functions and RLS policies.
2. **Future numbers never leak.** Premium forecast numbers are hidden by RLS until the result is verified or the viewer is entitled.
3. **Nothing published is ever edited.** Corrections create new versions with reasons; every administrative action lands in the audit log.
4. **Roles live in a dedicated table** checked by a security-definer function — never in user-editable profile data. The first admin is claimed once via a race-safe bootstrap; signups are always plain members.

See [docs/audit-report.md](docs/audit-report.md) for the full security audit and hardening report.

## Project status

### Must-haves (core platform)

- [x] Email and Google sign-in, with email confirmation
- [x] Secure one-time admin bootstrap (no automatic first-signup promotion)
- [x] Draw management with per-game rules (number range, line size, match threshold)
- [x] Forecast Studio: single-set and multi-line drafts, publish with cutoff enforcement
- [x] Immutable forecast versions with reasoned corrections
- [x] Results Centre: official source link required, verification, automatic scoring
- [x] Public History and Performance pages with real database-backed statistics
- [x] Premium gating of upcoming forecast numbers (database-enforced)
- [x] Audit log of all administrative actions
- [x] Manual bank-transfer memberships: configurable plans and bank details, receipt upload to private storage, admin review with verified amount/duration, atomic activation, duplicate-transaction protection
- [x] Renewal reminders: daily scheduled job (7/3/1/0 days before expiry, admin-configurable), shown in the member dashboard; delivery records are idempotent per expiry date
- [ ] Paystack online card payments (optional alternative checkout) — *needs Paystack keys*
- [ ] 3-day free trial gated on verified email **and** verified phone — *needs an SMS provider choice*
- [ ] Recurring draw schedules with automatic draw generation
- [ ] Admin member management (suspend accounts, view trial/verification status)

### Good-to-haves (later phases)

- [ ] Referral programme
- [ ] Member wallet
- [ ] "Admin Stake for Me" feature
- [ ] SMS/WhatsApp forecast delivery
- [ ] More providers and games beyond the launch two
- [ ] Public API for the verified track record

## Briefs

### For investors

LottoWizard attacks the biggest problem in the lottery-tip market: **trust**. Tipsters everywhere claim win rates nobody can check. LottoWizard's entire product is a verifiable track record — forecasts are locked and timestamped before each draw, scored automatically against official results, and the full history (including misses) is public. That transparency is the moat: it converts skeptics into paying members and is nearly impossible for a competitor to fake retroactively.

- **Market:** lottery play is mass-market across West Africa; Ghana's NLA and Nigeria's Golden Chance draw daily with huge informal tip economies around them.
- **Model:** monthly subscription (bank transfer today, Paystack card payments as an optional add-on) with a 3-day trial; premium forecasts are the paywall, the public record is the marketing.
- **Moat:** an accumulating, independently checkable performance history — every verified draw makes the platform harder to dismiss and harder to clone.
- **Status:** core platform, security-hardened admin tooling and bank-transfer memberships complete; the phone-verified trial is the next milestone.

### For admins

You run the daily operation from the **Admin** area:

1. **Draws** — create upcoming draws for each game; set the forecast cutoff (minutes before draw time).
2. **Forecast Studio** — pick an open draw, type the numbers (single set or multiple lines), save a draft or publish. Published forecasts can only be corrected by creating a new version with a reason — the original stays visible.
3. **Results Centre** — after the draw, enter the winning numbers and the official source link, then verify. Verification automatically scores every published forecast for that draw. Correcting a verified result requires a reason and rescores cleanly.
4. **Payments** — review bank-transfer evidence in the queue. Before approving, confirm the money actually arrived, then enter the verified amount, the duration to grant, and the bank transaction reference. An amount mismatch shows a warning; the same transaction reference can never be approved twice. Rejections require a reason the customer can see.
5. **Settings** — set the bank name, account name, account number and transfer instructions customers see; manage plans (name, months, price, currency, visibility); configure reminder days before expiry. All changes are audit-logged.
6. **Audit log** — every publish, verification, correction, payment decision and settings change is recorded here.

Memberships activate only through the verified approval step — a submitted receipt never grants access by itself. Early renewals extend from the current expiry, so members never lose paid time. Renewal reminders are recorded by a daily scheduled job and shown on the member's dashboard (email delivery can be layered on once a provider is configured).

The first administrator claims the role once from the Admin page; after that, no one can self-promote.

### For users

- **Browse free:** the History and Performance pages show every past forecast and exactly how it scored — no sign-up needed.
- **Join:** sign up with email or Google to follow upcoming draws.
- **Go premium:** open the Membership page, pick a plan, transfer the exact amount to the listed bank account, and submit your receipt and transaction reference. An administrator verifies the payment in the bank account and your access starts — you'll see the status of every request on the same page. Members see forecast numbers before the draw; everyone sees them after results are verified. A 3-day free trial is coming with phone verification.
- **Trust the record:** hit rates are computed from real, verified draws — 2+ matching numbers in a line is a hit, and the misses are shown too.

## Development

Built with [Lovable](https://lovable.dev) — every change in the editor syncs to this repository, and pushes to the synced branch sync back.

To work locally you need Node.js (via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)):

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Run the tests with `npx vitest run`. Database schema changes are applied as versioned migrations from the Lovable editor — never by editing migration history by hand.
