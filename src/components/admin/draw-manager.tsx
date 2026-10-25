import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useUser } from "@/lib/auth";
import { fetchGames } from "@/lib/data";
import { fetchAdminDraws } from "./helpers";
import { drawLocal, drawSchedule } from "./draw-time";
import { RecordActions, managementError } from "./record-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DrawManager() {
  const { user } = useUser();
  const admin = useIsAdmin(user?.id);
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  const draws = useQuery({ queryKey: ["admin-draws"], queryFn: fetchAdminDraws });
  const [gameId, setGameId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [cutoff, setCutoff] = useState("30");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("");
  const game = games.data?.find((g) => g.id === gameId);
  let preview: ReturnType<typeof drawSchedule> | null = null;
  try { if (game && date && time) preview = drawSchedule(date, time, game.timezone, Number(cutoff)); } catch { /* Validation appears on submit. */ }
  const selectedDay = date ? new Date(`${date}T12:00:00`) : undefined;
  function reset() { setEditing(null); setDate(""); setTime("19:00"); setCutoff("30"); }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!game) { toast.error("Select a game"); return; }
    setBusy(true);
    try {
      if (!cutoff.trim()) throw new Error("Enter forecast cutoff minutes");
      const payload = { game_id: game.id, ...drawSchedule(date, time, game.timezone, Number(cutoff)) };
      const query = editing ? supabase.from("draws").update(payload).eq("id", editing) : supabase.from("draws").insert(payload);
      const { error } = await query.select("id").single();
      if (error) throw error;
      await qc.invalidateQueries();
      toast.success(editing ? "Draw updated" : "Draw created"); reset();
    } catch (error) { managementError(error); } finally { setBusy(false); }
  }

  const visible = draws.data?.filter((d) => {
    if (filter !== "all" && d.game_id !== filter) return false;
    const timezone = games.data?.find((g) => g.id === d.game_id)?.timezone ?? "UTC";
    return !dayFilter || drawLocal(d.scheduled_at, timezone).date === dayFilter;
  });
  return <div className="space-y-6 pt-4">
    {admin.data && <section>
      <h2 className="mb-4 text-xl font-semibold">{editing ? "Edit draw" : "Add draw"}</h2>
      <form onSubmit={save} className="grid max-w-4xl items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><Label htmlFor="draw-game">Game</Label><Select value={gameId} onValueChange={setGameId}><SelectTrigger id="draw-game"><SelectValue placeholder="Select game" /></SelectTrigger><SelectContent>{games.data?.map((g) => <SelectItem key={g.id} value={g.id}>{g.provider?.name} · {g.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Draw date</Label><Popover open={calendarOpen} onOpenChange={setCalendarOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start" aria-label="Select draw date"><CalendarDays className="mr-2 h-4 w-4" />{selectedDay ? selectedDay.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Select date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={selectedDay} defaultMonth={selectedDay ?? new Date()} captionLayout="dropdown" startMonth={new Date(2020, 0)} endMonth={new Date(2040, 11)} onSelect={(value) => { if (!value) return; setDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`); setCalendarOpen(false); }} /></PopoverContent></Popover></div>
        <div className="space-y-2"><Label htmlFor="draw-time">Draw time</Label><Input id="draw-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="draw-cutoff">Cutoff minutes before draw</Label><Input id="draw-cutoff" type="number" min={0} step={1} required value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></div>
        {game && <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">{game.timezone}{preview ? ` · Forecast cutoff: ${new Date(preview.publication_cutoff_at).toLocaleString(undefined, { timeZone: game.timezone, dateStyle: "medium", timeStyle: "short" })}` : ""}</p>}
        <div className="flex gap-2"><Button disabled={busy || !game}><Save className="mr-2 h-4 w-4" />{busy ? "Saving…" : editing ? "Save draw" : "Add draw"}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancel</Button>}</div>
      </form>
    </section>}
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Draws</h2>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="draw-filter">Filter game</Label><Select value={filter} onValueChange={setFilter}><SelectTrigger id="draw-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All games</SelectItem>{games.data?.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="draw-date-filter">Filter draw date</Label><Input id="draw-date-filter" type="date" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} /></div></div>
      {draws.isPending && <p className="text-muted-foreground">Loading draws…</p>}
      {(draws.error || games.error) && <p className="text-destructive">Could not load draws or games.</p>}
      <div className="divide-y border-y">{visible?.map((d) => {
        const relatedGame = games.data?.find((g) => g.id === d.game_id);
        const timezone = relatedGame?.timezone ?? "UTC";
        const locked = Boolean(d.result_verified_at) || d.forecasts.some((f: { status: string; published_at: string | null }) => f.published_at || ["published", "superseded"].includes(f.status)) || d.draw_results.some((r: { status: string }) => ["verified", "superseded"].includes(r.status));
        const hasLinks = d.forecasts.length > 0 || d.draw_results.length > 0;
        return <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0"><h3 className="font-medium">{d.game?.provider?.name} · {d.game?.name}</h3><p className="text-sm text-muted-foreground">{new Date(d.scheduled_at).toLocaleString(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" })} · {timezone}</p><p className="text-xs text-muted-foreground">Cutoff: {new Date(d.publication_cutoff_at).toLocaleString(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" })}</p></div>
          <div className="flex items-center gap-2"><Badge variant="secondary">{locked ? "Published · locked" : d.draw_status}</Badge>{admin.data && <RecordActions name={`${d.game?.name} draw`} disabled={busy || locked} onEdit={() => {
            const local = drawLocal(d.scheduled_at, timezone); setEditing(d.id); setGameId(d.game_id); setDate(local.date); setTime(local.time); setCutoff(String(Math.round((Date.parse(d.scheduled_at) - Date.parse(d.publication_cutoff_at)) / 60000))); document.getElementById("draw-game")?.scrollIntoView({ block: "center" });
          }} onDelete={async () => {
            if (hasLinks) throw new Error("This draw has forecasts or results. Remove unpublished entries first.");
            const { error } = await supabase.from("draws").delete().eq("id", d.id).select("id").single(); if (error) throw error;
            if (editing === d.id) reset(); await qc.invalidateQueries(); toast.success("Draw deleted");
          }} />}</div>
        </div>;
      })}</div>
      {visible?.length === 0 && <p className="text-sm text-muted-foreground">No matching draws.</p>}
    </section>
  </div>;
}