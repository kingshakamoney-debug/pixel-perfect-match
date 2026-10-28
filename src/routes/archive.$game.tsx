import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchArchiveDraws, fetchArchiveGame, fetchArchiveYears, parseArchiveSearch, totalPages } from "@/lib/archive";
import { fmt } from "@/lib/data";
import { pad2 } from "@/lib/import-morning-dew";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/archive/$game")({
  validateSearch: (s: Record<string, unknown>) => parseArchiveSearch(s),
  head: ({ params }) => {
    const name = params.game.replace(/-/g, " ");
    return {
      meta: [
        { title: `${name} results archive — LottoWizard` },
        { name: "description", content: `Past winning numbers for ${name}, by year, with official source links.` },
        { property: "og:title", content: `${name} results archive — LottoWizard` },
        { property: "og:description", content: `Free historical ${name} results with verification status.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: GameArchive,
});

function Retry({ onRetry, text }: { onRetry: () => void; text: string }) {
  return (
    <div role="alert" className="rounded-xl border p-6 text-center">
      <p className="mb-3">{text}</p>
      <Button variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function GameArchive() {
  const { game: slug } = Route.useParams();
  const { year, page } = Route.useSearch();
  const game = useQuery({ queryKey: ["archive-game", slug], queryFn: () => fetchArchiveGame(slug) });
  const g = game.data;
  const years = useQuery({ queryKey: ["archive-years", g?.id], enabled: !!g, queryFn: () => fetchArchiveYears(g!.id) });
  const draws = useQuery({ queryKey: ["archive-draws", g?.id, year, page], enabled: !!g, queryFn: () => fetchArchiveDraws(g!, year, page) });

  if (game.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (game.isError) return <Retry text="We couldn't load this game." onRetry={() => game.refetch()} />;
  if (!g) return (
    <div className="rounded-xl border p-8 text-center">
      <p className="mb-3">That game isn't in the archive.</p>
      <Button asChild variant="outline"><Link to="/archive">Back to archive</Link></Button>
    </div>
  );

  const pages = totalPages(draws.data?.count ?? 0);
  const yearChip = (y: number | undefined, label: string) => (
    <Link key={label} to="/archive/$game" params={{ game: slug }} search={{ year: y, page: 1 }}
      className={`rounded-full border px-3 py-1 text-sm ${year === y ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/archive" className="hover:text-foreground">Archive</Link> / {g.provider?.country?.name} / {g.provider?.name}
      </nav>
      <div>
        <h1 className="text-3xl font-bold">{g.name}</h1>
        <p className="text-muted-foreground">{g.numbers_drawn} numbers drawn from {g.min_number}–{g.max_number} · times in {g.timezone}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {yearChip(undefined, "All years")}
        {(years.data ?? []).map((y) => yearChip(y.year, `${y.year} (${y.draw_count})`))}
      </div>

      {draws.isLoading && <p className="text-muted-foreground">Loading draws…</p>}
      {draws.isError && <Retry text="We couldn't load these draws." onRetry={() => draws.refetch()} />}
      {draws.isSuccess && draws.data.draws.length === 0 && (
        <p className="rounded-xl border p-8 text-center text-muted-foreground">No draws recorded{year ? ` for ${year}` : ""}.</p>
      )}

      <div className="space-y-3">
        {(draws.data?.draws ?? []).map((d) => {
          const verified = d.draw_results.find((r) => r.status === "verified");
          const corrections = d.draw_results.filter((r) => r.status === "superseded").length;
          const nums = (t: string) => (verified?.result_numbers ?? []).filter((n) => n.number_type === t).map((n) => n.number_value).sort((a, b) => a - b);
          const main = nums("regular"); const bonus = nums("bonus");
          return (
            <article key={d.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{d.draw_number && <span className="mr-2 font-mono text-muted-foreground">#{d.draw_number}</span>}{fmt(d.scheduled_at)}</div>
                {verified ? <Badge>Verified</Badge> : <Badge variant="secondary">Awaiting verified result</Badge>}
              </div>
              {verified ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {main.map((n) => <span key={n} className="ball ball-win">{pad2(n)}</span>)}
                  {bonus.length > 0 && <span className="mx-1 text-xs text-muted-foreground">machine / bonus</span>}
                  {bonus.map((n) => <span key={`b${n}`} className="ball">{pad2(n)}</span>)}
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">No verified winning numbers yet.</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {verified?.source_url && <a href={verified.source_url} target="_blank" rel="noreferrer" className="text-primary underline">Official source</a>}
                {verified && <span>Verified {fmt(verified.verified_at)}</span>}
                {corrections > 0 && <span>Corrected · {corrections} earlier version{corrections === 1 ? "" : "s"} kept on record</span>}
              </div>
            </article>
          );
        })}
      </div>

      {draws.isSuccess && pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link to="/archive/$game" params={{ game: slug }} search={{ year, page: Math.max(1, page - 1) }}>Previous</Link>
          </Button>
          <span className="text-sm text-muted-foreground">Page {Math.min(page, pages)} of {pages} · {draws.data.count} draws</span>
          <Button asChild variant="outline" size="sm" disabled={page >= pages}>
            <Link to="/archive/$game" params={{ game: slug }} search={{ year, page: Math.min(pages, page + 1) }}>Next</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
