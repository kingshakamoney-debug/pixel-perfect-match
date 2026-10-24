import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchScores } from "@/lib/data";
import { computePerformance, pct } from "@/lib/stats";
import { GameFilter } from "@/components/game-filter";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Performance statistics — LottoWizard" },
      { name: "description", content: "Combination and draw hit rates, match distribution and sample sizes." },
      { property: "og:title", content: "Performance statistics — LottoWizard" },
      { property: "og:description", content: "Transparent forecast hit rates with sample sizes and methodology." },
    ],
  }),
  component: Performance,
});

function Performance() {
  const [game, setGame] = useState("all");
  const q = useQuery({ queryKey: ["scores", game], queryFn: () => fetchScores(game === "all" ? undefined : game) });
  const p = computePerformance(q.data ?? []);
  const dist = [0, 1, 2, 3, 4, 5].map((h) => ({ hits: `${h}`, count: p.distribution[h] ?? 0 }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Performance</h1>
        <GameFilter value={game} onChange={setGame} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Draw hit rate" value={pct(p.drawRate)} note={`${p.successDraws} / ${p.totalDraws} draws`} />
        <Card label="Combination hit rate" value={pct(p.comboRate)} note={`${p.successCombos} / ${p.totalCombos} combinations`} />
        <Card label="Average matches" value={p.avgHits == null ? "—" : p.avgHits.toFixed(2)} note={`${p.totalCombos} scored combinations`} />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 font-semibold">Match distribution</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={dist}>
              <XAxis dataKey="hits" stroke="var(--muted-foreground)" />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border p-5 text-sm text-muted-foreground space-y-2">
        <h2 className="font-semibold text-foreground">Methodology</h2>
        <p>A combination is a hit when it matches at least the game's threshold (default 2) of the regular winning numbers. Bonus numbers are not counted.</p>
        <p>Combination hit rate = hit combinations ÷ scored combinations. Draw hit rate = draws with at least one hit combination ÷ verified draws that had a published forecast.</p>
        <p>Only verified official results are included. Pending or invalid results are excluded. Hit rates do not represent winnings or financial returns.</p>
      </div>
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold text-primary">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}
