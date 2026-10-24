import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useUser } from "@/lib/auth";
import { fetchGames, fmt } from "@/lib/data";
import { fetchAdminDraws, insertCombos, parseNumbers, validateCombo } from "@/components/admin/helpers";
import { Balls } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — DrawLens" }, { name: "description", content: "Manage draws, forecasts and results." }] }),
  component: Admin,
});

function Admin() {
  const { user } = useUser();
  const admin = useIsAdmin(user?.id);
  if (admin.isLoading || !user) return null;
  if (!admin.data) return <p className="text-muted-foreground">You don't have administrator access.</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <Tabs defaultValue="draws">
        <TabsList>
          <TabsTrigger value="draws">Draws</TabsTrigger>
          <TabsTrigger value="studio">Forecast Studio</TabsTrigger>
          <TabsTrigger value="results">Results Centre</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="draws"><DrawsTab /></TabsContent>
        <TabsContent value="studio"><StudioTab /></TabsContent>
        <TabsContent value="results"><ResultsTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const err = (e: unknown) => toast.error((e as any)?.message ?? String(e));
function useDraws() { return useQuery({ queryKey: ["admin-draws"], queryFn: fetchAdminDraws }); }
const drawLabel = (d: any) => `${d.game?.provider?.name} · ${d.game?.name} — ${fmt(d.scheduled_at)}`;

function DrawsTab() {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  const draws = useDraws();
  const [gameId, setGameId] = useState("");
  const [when, setWhen] = useState("");
  const [cutoff, setCutoff] = useState(30);

  async function create() {
    if (!gameId || !when) return toast.error("Pick a game and date");
    const at = new Date(when);
    const { error } = await supabase.from("draws").insert({
      game_id: gameId,
      scheduled_at: at.toISOString(),
      publication_cutoff_at: new Date(at.getTime() - cutoff * 60000).toISOString(),
    });
    if (error) return err(error);
    toast.success("Draw created");
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-4">
        <div className="space-y-1"><Label>Game</Label>
          <Select value={gameId} onValueChange={setGameId}>
            <SelectTrigger><SelectValue placeholder="Select game" /></SelectTrigger>
            <SelectContent>{(games.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.provider?.name} · {g.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Draw time (your local time)</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <div className="space-y-1"><Label>Forecast cutoff (minutes before)</Label><Input type="number" min={0} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} /></div>
        <div className="flex items-end"><Button onClick={create} className="w-full"><Plus className="mr-1 h-4 w-4" />Add draw</Button></div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        {(draws.data ?? []).map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-4 last:border-0">
            <div>
              <div className="font-medium">{d.game?.provider?.name} · {d.game?.name}</div>
              <div className="text-xs text-muted-foreground">{fmt(d.scheduled_at)} · cutoff {fmt(d.publication_cutoff_at)}</div>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary">{d.forecasts.filter((f: any) => f.status === "published").length ? "Forecast published" : "No forecast"}</Badge>
              <Badge variant={d.result_verified_at ? "default" : "outline"}>{d.result_verified_at ? "Result verified" : d.draw_status}</Badge>
            </div>
          </div>
        ))}
        {draws.data?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No draws yet.</p>}
      </div>
    </div>
  );
}

function StudioTab() {
  const qc = useQueryClient();
  const draws = useDraws();
  const [drawId, setDrawId] = useState("");
  const [type, setType] = useState<"single" | "multiple">("single");
  const [combos, setCombos] = useState<string[]>([""]);
  const [correctFor, setCorrectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (draws.data ?? []).filter((d) => new Date(d.publication_cutoff_at) > new Date() && !d.result_verified_at);
  const draw = (draws.data ?? []).find((d) => d.id === drawId);

  async function save(publish: boolean) {
    if (!draw) return toast.error("Select a draw");
    const parsed = combos.map(parseNumbers);
    for (let i = 0; i < parsed.length; i++) {
      const msg = validateCombo(parsed[i], draw.game, draw.game.numbers_per_combination);
      if (msg) return toast.error(`Combination ${i + 1}: ${msg}`);
    }
    setBusy(true);
    try {
      let id: string;
      if (correctFor) {
        const { data, error } = await supabase.rpc("create_forecast_correction", { _forecast_id: correctFor, _reason: reason });
        if (error) throw error;
        id = data as string;
        const { error: de } = await supabase.from("forecast_combinations").delete().eq("forecast_id", id);
        if (de) throw de;
      } else {
        const { data, error } = await supabase.from("forecasts").insert({ draw_id: draw.id, forecast_type: type, created_by: (await supabase.auth.getUser()).data.user?.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      await insertCombos(id, parsed);
      if (publish) {
        const { error } = await supabase.rpc("publish_forecast", { _forecast_id: id });
        if (error) throw error;
      }
      toast.success(publish ? "Forecast published" : "Draft saved");
      setCombos([""]); setCorrectFor(null); setReason("");
      qc.invalidateQueries();
    } catch (e) { err(e); }
    setBusy(false);
  }

  async function publishDraft(id: string) {
    const { error } = await supabase.rpc("publish_forecast", { _forecast_id: id });
    if (error) return err(error);
    toast.success("Published"); qc.invalidateQueries();
  }
  async function deleteDraft(id: string) {
    const { error } = await supabase.from("forecasts").delete().eq("id", id);
    if (error) return err(error);
    qc.invalidateQueries();
  }

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1"><Label>Draw</Label>
          <Select value={drawId} onValueChange={(v) => { setDrawId(v); setCorrectFor(null); }}>
            <SelectTrigger><SelectValue placeholder="Select an open draw" /></SelectTrigger>
            <SelectContent>{open.map((d) => <SelectItem key={d.id} value={d.id}>{drawLabel(d)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {!correctFor && (
          <div className="flex gap-2">
            <Button size="sm" variant={type === "single" ? "default" : "outline"} onClick={() => { setType("single"); setCombos((c) => c.slice(0, 1)); }}>Single set</Button>
            <Button size="sm" variant={type === "multiple" ? "default" : "outline"} onClick={() => setType("multiple")}>Multiple combinations</Button>
          </div>
        )}
        {correctFor && (
          <div className="space-y-1"><Label>Correction reason (required)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        )}
        {draw && <p className="text-xs text-muted-foreground">{draw.game.numbers_per_combination} numbers per line, {draw.game.min_number}–{draw.game.max_number}. Separate with spaces or commas.</p>}
        {combos.map((c, i) => {
          const msg = c && draw ? validateCombo(parseNumbers(c), draw.game, draw.game.numbers_per_combination) : null;
          return (
            <div key={i} className="space-y-1">
              <div className="flex gap-2">
                <span className="w-8 pt-2 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                <Input className="font-mono" placeholder="e.g. 7 18 33 54 81" value={c} onChange={(e) => setCombos(combos.map((x, j) => (j === i ? e.target.value : x)))} />
                {combos.length > 1 && <Button size="icon" variant="ghost" onClick={() => setCombos(combos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
              </div>
              {msg && <p className="pl-10 text-xs text-destructive">{msg}</p>}
            </div>
          );
        })}
        {(type === "multiple") && <Button size="sm" variant="outline" onClick={() => setCombos([...combos, ""])}><Plus className="mr-1 h-4 w-4" />Add combination</Button>}
        <div className="flex gap-2 pt-2">
          {!correctFor && <Button variant="outline" disabled={busy} onClick={() => save(false)}>Save draft</Button>}
          <Button disabled={busy} onClick={() => save(true)}>{correctFor ? "Publish correction" : "Publish now"}</Button>
          {correctFor && <Button variant="ghost" onClick={() => { setCorrectFor(null); setCombos([""]); }}>Cancel</Button>}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Forecasts for this draw</h3>
        {!draw && <p className="text-sm text-muted-foreground">Select a draw to see its forecasts.</p>}
        {draw?.forecasts.sort((a: any, b: any) => b.version - a.version).map((f: any) => (
          <div key={f.id} className="space-y-2 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">v{f.version} · {f.forecast_type} · {f.published_at ? `published ${fmt(f.published_at)}` : "not published"}</span>
              <Badge variant={f.status === "published" ? "default" : "secondary"}>{f.status}</Badge>
            </div>
            {f.forecast_combinations.sort((a: any, b: any) => a.combination_number - b.combination_number).map((c: any) => (
              <Balls key={c.id} size="sm" numbers={c.forecast_numbers.map((n: any) => n.number_value).sort((a: number, b: number) => a - b)} />
            ))}
            <div className="flex gap-2">
              {f.status === "draft" && <><Button size="sm" onClick={() => publishDraft(f.id)}>Publish</Button><Button size="sm" variant="ghost" onClick={() => deleteDraft(f.id)}>Delete</Button></>}
              {f.status === "published" && (
                <Button size="sm" variant="outline" onClick={() => {
                  setCorrectFor(f.id);
                  setType(f.forecast_type);
                  setCombos(f.forecast_combinations.sort((a: any, b: any) => a.combination_number - b.combination_number).map((c: any) => c.forecast_numbers.map((n: any) => n.number_value).sort((a: number, b: number) => a - b).join(" ")));
                }}>Create corrected version</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsTab() {
  const qc = useQueryClient();
  const draws = useDraws();
  const [drawId, setDrawId] = useState("");
  const [nums, setNums] = useState("");
  const [source, setSource] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const past = (draws.data ?? []).filter((d) => new Date(d.scheduled_at) <= new Date());
  const draw = past.find((d) => d.id === drawId);

  async function submit() {
    if (!draw) return toast.error("Select a draw");
    const parsed = parseNumbers(nums);
    const msg = validateCombo(parsed, draw.game, draw.game.numbers_drawn);
    if (msg) return toast.error(msg);
    if (!/^https?:\/\//.test(source)) return toast.error("Add the official source link");
    if (draw.result_verified_at && !reason.trim()) return toast.error("A correction reason is required");
    setBusy(true);
    try {
      const { data: r, error } = await supabase.from("draw_results").insert({
        draw_id: draw.id, source_url: source, correction_reason: draw.result_verified_at ? reason : null,
        submitted_by: (await supabase.auth.getUser()).data.user?.id,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("result_numbers").insert(parsed.map((n) => ({ result_id: r.id, number_value: n })));
      if (e2) throw e2;
      const { data: scored, error: e3 } = await supabase.rpc("verify_result", { _result_id: r.id });
      if (e3) throw e3;
      toast.success(`Result verified · ${scored} combination(s) scored`);
      setNums(""); setSource(""); setReason("");
      qc.invalidateQueries();
    } catch (e) { err(e); }
    setBusy(false);
  }

  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-card p-5 mt-4">
      <div className="space-y-1"><Label>Draw</Label>
        <Select value={drawId} onValueChange={setDrawId}>
          <SelectTrigger><SelectValue placeholder="Select a completed draw" /></SelectTrigger>
          <SelectContent>{past.map((d) => <SelectItem key={d.id} value={d.id}>{drawLabel(d)}{d.result_verified_at ? " (verified)" : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Winning numbers</Label><Input className="font-mono" value={nums} onChange={(e) => setNums(e.target.value)} placeholder="e.g. 4 19 27 62 88" /></div>
      <div className="space-y-1"><Label>Official source link</Label><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://" /></div>
      {draw?.result_verified_at && (
        <div className="space-y-1"><Label>Correction reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      )}
      <Button disabled={busy} onClick={submit}>{draw?.result_verified_at ? "Submit correction & rescore" : "Verify & score"}</Button>
    </div>
  );
}

function AuditTab() {
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <div className="mt-4 overflow-hidden rounded-xl border">
      {(q.data ?? []).map((a) => (
        <div key={a.id} className="flex flex-wrap justify-between gap-2 border-b p-3 text-sm last:border-0">
          <span><span className="font-mono">{a.action}</span> · {a.entity_type} {a.reason && <span className="text-muted-foreground">— {a.reason}</span>}</span>
          <span className="text-muted-foreground">{fmt(a.created_at)}</span>
        </div>
      ))}
      {q.data?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No activity yet.</p>}
    </div>
  );
}
