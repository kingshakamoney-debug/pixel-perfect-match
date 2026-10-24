import { supabase } from "@/integrations/supabase/client";

export type Game = {
  id: string; name: string; slug: string; min_number: number; max_number: number;
  numbers_drawn: number; numbers_per_combination: number; min_match_threshold: number; timezone: string;
  provider: { id: string; name: string } | null;
};

export async function fetchGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from("games")
    .select("id,name,slug,min_number,max_number,numbers_drawn,numbers_per_combination,min_match_threshold,timezone,provider:providers(id,name)")
    .order("name");
  if (error) throw error;
  return data as unknown as Game[];
}

export type HistoryDraw = {
  id: string; scheduled_at: string; result_verified_at: string | null; game_id: string;
  game: { name: string; min_match_threshold: number; provider: { name: string } | null } | null;
  draw_results: { id: string; status: string; source_url: string | null; verified_at: string | null; correction_reason: string | null; result_numbers: { number_value: number; number_type: string }[] }[];
  forecasts: { id: string; forecast_type: string; status: string; version: number; published_at: string | null; correction_reason: string | null;
    forecast_combinations: { id: string; combination_number: number; forecast_numbers: { number_value: number; number_type: string }[] }[] }[];
};

export async function fetchHistory(gameId?: string): Promise<HistoryDraw[]> {
  let q = supabase
    .from("draws")
    .select(`id,scheduled_at,result_verified_at,game_id,
      game:games(name,min_match_threshold,provider:providers(name)),
      draw_results(id,status,source_url,verified_at,correction_reason,result_numbers(number_value,number_type)),
      forecasts(id,forecast_type,status,version,published_at,correction_reason,forecast_combinations(id,combination_number,forecast_numbers(number_value,number_type)))`)
    .not("result_verified_at", "is", null)
    .order("scheduled_at", { ascending: false })
    .limit(200);
  if (gameId) q = q.eq("game_id", gameId);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as HistoryDraw[];
}

export async function fetchScores(gameId?: string) {
  let q = supabase
    .from("forecast_scores")
    .select("hit_count,is_success,draw_results!inner(draw_id,status,draws!inner(game_id))")
    .eq("draw_results.status", "verified");
  if (gameId) q = q.eq("draw_results.draws.game_id", gameId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((s: any) => ({ hit_count: s.hit_count, is_success: s.is_success, draw_id: s.draw_results.draw_id as string }));
}

export async function fetchUpcoming() {
  const { data, error } = await supabase
    .from("draws")
    .select("id,scheduled_at,publication_cutoff_at,draw_status,game:games(name,provider:providers(name)),forecasts(id,status)")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(20);
  if (error) throw error;
  return data as any[];
}

export const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
