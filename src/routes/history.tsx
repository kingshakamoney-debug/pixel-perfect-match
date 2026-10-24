import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchHistory, fmt } from "@/lib/data";
import { countHits } from "@/lib/stats";
import { GameFilter } from "@/components/game-filter";
import { Balls } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Draw history — LottoWizard" },
      { name: "description", content: "Verified draws with the original published forecasts and match counts." },
      { property: "og:title", content: "Draw history — LottoWizard" },
      { property: "og:description", content: "Every verified draw, the forecast published before it, and how many numbers matched." },
    ],
  }),
  component: History,
});

function History() {
  const [game, setGame] = useState("all");
  const q = useQuery({ queryKey: ["history", game], queryFn: () => fetchHistory(game === "all" ? undefined : game) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Verified history</h1>
          <p className="text-muted-foreground">Original published combinations against official winning numbers.</p>
        </div>
        <GameFilter value={game} onChange={setGame} />
      </div>
      {q.data?.length === 0 && <p className="rounded-xl border p-8 text-center text-muted-foreground">No verified draws yet.</p>}
      <div className="space-y-4">
        {(q.data ?? []).map((d) => {
          const result = d.draw_results.find((r) => r.status === "verified");
          const winning = (result?.result_numbers ?? []).filter((n) => n.number_type === "regular").map((n) => n.number_value).sort((a, b) => a - b);
          const winSet = new Set(winning);
          const threshold = d.game?.min_match_threshold ?? 2;
          const forecasts = d.forecasts.filter((f) => f.published_at).sort((a, b) => a.version - b.version);
          return (
            <article key={d.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{d.game?.provider?.name} · {d.game?.name}</div>
                  <div className="text-sm text-muted-foreground">Draw {fmt(d.scheduled_at)} · verified {fmt(result?.verified_at ?? null)}</div>
                </div>
                {result?.source_url && <a href={result.source_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Official source</a>}
              </div>
              {result?.correction_reason && <p className="mt-2 text-xs text-gold">Result corrected: {result.correction_reason}</p>}
              <div className="mt-4">
                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Winning numbers</div>
                <div className="flex flex-wrap gap-1.5">{winning.map((n) => <span key={n} className="ball ball-win">{n}</span>)}</div>
              </div>
              {forecasts.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No forecast was published for this draw.</p>}
              {forecasts.map((f) => (
                <div key={f.id} className="mt-4 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Forecast v{f.version} · published {fmt(f.published_at)} {f.status === "superseded" && "· superseded"}
                    {f.correction_reason && ` · correction: ${f.correction_reason}`}
                  </div>
                  {f.forecast_combinations.sort((a, b) => a.combination_number - b.combination_number).map((c) => {
                    const nums = c.forecast_numbers.filter((n) => n.number_type === "regular").map((n) => n.number_value).sort((a, b) => a - b);
                    const hits = countHits(nums, winning);
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-3">
                        <span className="w-6 font-mono text-xs text-muted-foreground">#{c.combination_number}</span>
                        <Balls numbers={nums} hits={winSet} size="sm" />
                        <Badge variant={hits >= threshold ? "default" : "secondary"}>{hits} match{hits === 1 ? "" : "es"}{hits >= threshold ? " · hit" : ""}</Badge>
                      </div>
                    );
                  })}
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}
