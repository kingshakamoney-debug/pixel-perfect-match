import { Temporal } from "@js-temporal/polyfill";
import { supabase } from "@/integrations/supabase/client";

export const ARCHIVE_PAGE_SIZE = 50;

/** Sanitise untrusted URL values for the archive page. */
export function parseArchiveSearch(search: Record<string, unknown>): { year?: number | undefined; page: number } {
  const y = Number(search['year']);
  const p = Number(search['page']);
  return {
    year: Number.isInteger(y) && y >= 1900 && y <= 2200 ? y : undefined,
    page: Number.isInteger(p) && p >= 1 && p <= 100_000 ? p : 1,
  };
}

/** UTC instants bounding a calendar year in the game's own timezone. */
export function yearBounds(year: number, timezone: string): { from: string; to: string } {
  const start = Temporal.PlainDate.from({ year, month: 1, day: 1 }).toZonedDateTime({ timeZone: timezone });
  const end = Temporal.PlainDate.from({ year: year + 1, month: 1, day: 1 }).toZonedDateTime({ timeZone: timezone });
  return { from: start.toInstant().toString(), to: end.toInstant().toString() };
}

/** Inclusive row range for a 1-based page. */
export function pageRange(page: number, size = ARCHIVE_PAGE_SIZE): [number, number] {
  const p = Math.max(1, Math.floor(page));
  return [(p - 1) * size, p * size - 1];
}

export const totalPages = (count: number, size = ARCHIVE_PAGE_SIZE) => Math.max(1, Math.ceil(count / size));

export type ArchiveGame = {
  id: string; name: string; slug: string; timezone: string; min_number: number; max_number: number; numbers_drawn: number;
  provider: { id: string; name: string; slug: string; country: { id: string; name: string; code: string } | null } | null;
};

export async function fetchArchiveGames(): Promise<ArchiveGame[]> {
  const { data, error } = await supabase
    .from("games")
    .select("id,name,slug,timezone,min_number,max_number,numbers_drawn,provider:providers(id,name,slug,country:countries(id,name,code))")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data as unknown as ArchiveGame[];
}

export async function fetchArchiveGame(slug: string): Promise<ArchiveGame | null> {
  const { data, error } = await supabase
    .from("games")
    .select("id,name,slug,timezone,min_number,max_number,numbers_drawn,provider:providers(id,name,slug,country:countries(id,name,code))")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ArchiveGame | null;
}

export async function fetchArchiveYears(gameId: string) {
  const { data, error } = await supabase.rpc("archive_years", { _game_id: gameId });
  if (error) throw error;
  return (data ?? []) as { year: number; draw_count: number }[];
}

export type ArchiveDraw = {
  id: string; draw_number: string | null; scheduled_at: string; result_verified_at: string | null;
  draw_results: { id: string; status: string; source_url: string | null; verified_at: string | null; version: number;
    result_numbers: { number_value: number; number_type: string }[] }[];
};

/** Past draws for one game, newest first (ties broken by id), paginated with an exact total. */
export async function fetchArchiveDraws(game: ArchiveGame, year: number | undefined, page: number) {
  const [from, to] = pageRange(page);
  let q = supabase
    .from("draws")
    .select("id,draw_number,scheduled_at,result_verified_at,draw_results(id,status,source_url,verified_at,version,result_numbers(number_value,number_type))", { count: "exact" })
    .eq("game_id", game.id)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (year) {
    const b = yearBounds(year, game.timezone);
    q = q.gte("scheduled_at", b.from).lt("scheduled_at", b.to);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { draws: (data ?? []) as unknown as ArchiveDraw[], count: count ?? 0 };
}
