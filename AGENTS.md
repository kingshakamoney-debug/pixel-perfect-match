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

- Business rules (forecast publishing, cutoffs, result verification, scoring, entitlement) live in Postgres security-definer RPCs and RLS; the UI only calls them. Why: browser checks are bypassable.
- Premium forecast numbers are hidden by RLS (`can_view_forecast_numbers`) until the draw's result is verified or the viewer is entitled. Why: never leak future forecasts.
- Published forecasts and verified results are never edited in place; corrections create a new version and supersede the old one with an audit log. Why: auditable history.
- Pure scoring/validation helpers live in `src/lib/stats.ts` and `src/components/admin/helpers.ts` with vitest tests beside them.
- Signups always start as plain members; the first admin is claimed once via the race-safe `bootstrap_admin()` RPC (advisory lock, only while zero admins exist), shown as a claim button on the Admin page. Why: automatic first-signup promotion let any first registrant silently become admin.
