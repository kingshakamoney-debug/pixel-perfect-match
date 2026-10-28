import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchArchiveGames, type ArchiveGame } from "@/lib/archive";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/archive/")({
  head: () => ({
    meta: [
      { title: "Lotto results archive — LottoWizard" },
      { name: "description", content: "Free historical lotto results by country, provider, game and year, with official sources." },
      { property: "og:title", content: "Lotto results archive — LottoWizard" },
      { property: "og:description", content: "Browse past winning numbers for every supported lottery, free." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchiveIndex,
});

function ArchiveIndex() {
  const q = useQuery({ queryKey: ["archive-games"], queryFn: fetchArchiveGames });
  const byCountry = new Map<string, { name: string; providers: Map<string, { name: string; games: ArchiveGame[] }> }>();
  for (const g of q.data ?? []) {
    const c = g.provider?.country; const p = g.provider;
    if (!c || !p) continue;
    if (!byCountry.has(c.id)) byCountry.set(c.id, { name: c.name, providers: new Map() });
    const cp = byCountry.get(c.id)!.providers;
    if (!cp.has(p.id)) cp.set(p.id, { name: p.name, games: [] });
    cp.get(p.id)!.games.push(g);
  }
  const countries = [...byCountry.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Results archive</h1>
        <p className="text-muted-foreground">Free past winning numbers. Pick a country, provider and game.</p>
      </div>
      {q.isLoading && <p className="text-muted-foreground">Loading lotteries…</p>}
      {q.isError && (
        <div role="alert" className="rounded-xl border p-6 text-center">
          <p className="mb-3">We couldn't load the archive.</p>
          <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>
        </div>
      )}
      {q.isSuccess && countries.length === 0 && <p className="rounded-xl border p-8 text-center text-muted-foreground">No lotteries yet.</p>}
      <div className="space-y-6">
        {countries.map((c) => (
          <section key={c.name} className="rounded-xl border bg-card p-5">
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {[...c.providers.values()].map((p) => (
                <div key={p.name}>
                  <div className="text-sm uppercase tracking-wider text-muted-foreground">{p.name}</div>
                  <ul className="mt-1 space-y-1">
                    {p.games.map((g) => (
                      <li key={g.id}>
                        <Link to="/archive/$game" params={{ game: g.slug }} search={{}} className="text-primary underline-offset-4 hover:underline">
                          {g.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{g.numbers_drawn} from {g.min_number}–{g.max_number}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
