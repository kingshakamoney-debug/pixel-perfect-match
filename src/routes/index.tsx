import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchScores, fetchUpcoming, fmt } from "@/lib/data";
import { computePerformance, pct } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DrawLens — Lotto forecasts with verified track records" },
      { name: "description", content: "Ghana NLA and Golden Chance forecasts, scored openly against official results." },
      { property: "og:title", content: "DrawLens — Lotto forecasts with verified track records" },
      { property: "og:description", content: "Every published forecast scored against verified official results. 2+ matches counts as a hit." },
    ],
  }),
  component: Index,
});

function Index() {
  const scores = useQuery({ queryKey: ["scores", "all"], queryFn: () => fetchScores() });
  const upcoming = useQuery({ queryKey: ["upcoming"], queryFn: fetchUpcoming });
  const p = computePerformance(scores.data ?? []);

  return (
    <div className="space-y-12">
      <section className="bg-hero -mx-4 rounded-2xl px-4 py-14 text-center">
        <Badge variant="outline" className="mb-4">Ghana NLA · Golden Chance</Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
          Forecasts you can audit, draw by draw.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Every forecast is timestamped before the draw and scored against the verified official result. Two or more matching numbers counts as a hit.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg"><Link to="/history">See the record</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/dashboard">Today's forecasts</Link></Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Draw hit rate" value={pct(p.drawRate)} note={`${p.successDraws} of ${p.totalDraws} verified draws`} />
        <Stat label="Combination hit rate" value={pct(p.comboRate)} note={`${p.successCombos} of ${p.totalCombos} lines`} />
        <Stat label="Average matches" value={p.avgHits == null ? "—" : p.avgHits.toFixed(2)} note="per combination" />
        <Stat label="Verified draws" value={String(p.totalDraws)} note="sample size" />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Upcoming draws</h2>
        <div className="overflow-hidden rounded-xl border">
          {(upcoming.data ?? []).length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">No draws scheduled yet.</p>
          )}
          {(upcoming.data ?? []).map((d) => {
            const published = d.forecasts?.some((f: any) => f.status === "published");
            return (
              <div key={d.id} className="flex items-center justify-between border-b p-4 last:border-0">
                <div>
                  <div className="font-medium">{d.game?.provider?.name} · {d.game?.name}</div>
                  <div className="text-sm text-muted-foreground">{fmt(d.scheduled_at)}</div>
                </div>
                <Badge variant={published ? "default" : "secondary"}>{published ? "Forecast ready" : "Pending"}</Badge>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold text-primary">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}
