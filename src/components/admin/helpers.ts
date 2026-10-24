import { supabase } from "@/integrations/supabase/client";
import type { Game } from "@/lib/data";

export function parseNumbers(text: string): number[] {
  return text.split(/[\s,]+/).filter(Boolean).map(Number);
}

/** Returns an error message, or null when the numbers fit the game's rules. */
export function validateCombo(nums: number[], game: Pick<Game, "min_number" | "max_number">, required: number): string | null {
  if (nums.some((n) => !Number.isInteger(n))) return "Only whole numbers are allowed";
  if (nums.length !== required) return `Enter exactly ${required} numbers`;
  if (new Set(nums).size !== nums.length) return "Duplicate numbers are not allowed";
  const bad = nums.find((n) => n < game.min_number || n > game.max_number);
  if (bad !== undefined) return `${bad} is outside ${game.min_number}–${game.max_number}`;
  return null;
}

export async function insertCombos(forecastId: string, combos: number[][]) {
  for (let i = 0; i < combos.length; i++) {
    const { data: c, error } = await supabase
      .from("forecast_combinations")
      .insert({ forecast_id: forecastId, combination_number: i + 1 })
      .select("id")
      .single();
    if (error) throw error;
    const { error: e2 } = await supabase
      .from("forecast_numbers")
      .insert(combos[i].map((n) => ({ combination_id: c.id, number_value: n })));
    if (e2) throw e2;
  }
}

export async function fetchAdminDraws() {
  const { data, error } = await supabase
    .from("draws")
    .select("id,scheduled_at,publication_cutoff_at,draw_status,result_verified_at,game_id,game:games(name,min_number,max_number,numbers_drawn,numbers_per_combination,provider:providers(name)),forecasts(id,status,version,forecast_type,published_at,correction_reason,forecast_combinations(id,combination_number,forecast_numbers(number_value))),draw_results(id,status,verified_at)")
    .order("scheduled_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as any[];
}
