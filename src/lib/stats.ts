export type ScoreRow = { draw_id: string; hit_count: number; is_success: boolean };

/** Counts distinct regular-number matches between a combination and winning numbers. */
export function countHits(predicted: number[], winning: number[]): number {
  const w = new Set(winning);
  return new Set(predicted.filter((n) => w.has(n))).size;
}

export function isSuccess(hits: number, threshold = 2): boolean {
  return hits >= threshold;
}

export function computePerformance(scores: ScoreRow[]) {
  const totalCombos = scores.length;
  const successCombos = scores.filter((s) => s.is_success).length;
  const draws = new Map<string, boolean>();
  for (const s of scores) draws.set(s.draw_id, (draws.get(s.draw_id) ?? false) || s.is_success);
  const totalDraws = draws.size;
  const successDraws = [...draws.values()].filter(Boolean).length;
  const distribution: Record<number, number> = {};
  for (const s of scores) distribution[s.hit_count] = (distribution[s.hit_count] ?? 0) + 1;
  return {
    totalCombos,
    successCombos,
    comboRate: totalCombos ? successCombos / totalCombos : null,
    totalDraws,
    successDraws,
    drawRate: totalDraws ? successDraws / totalDraws : null,
    avgHits: totalCombos ? scores.reduce((a, s) => a + s.hit_count, 0) / totalCombos : null,
    distribution,
  };
}

export const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
