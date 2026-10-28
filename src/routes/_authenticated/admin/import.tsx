import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchGames } from "@/lib/data";
import { useIsAdmin, useUser } from "@/lib/auth";
import { parseMorningDew, type ParsedRow } from "@/lib/import-morning-dew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/import")({
  head: () => ({ meta: [{ title: "Historical import — LottoWizard" }, { name: "description", content: "Import historical lotto results for review." }, { property: "og:title", content: "Historical import — LottoWizard" }, { property: "og:description", content: "Import historical lotto results for review." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: ImportPage,
});

function ImportPage() {
  const { user } = useUser();
  const admin = useIsAdmin(user?.id);
  if (admin.isLoading || !user) return null;
  if (!admin.data) return <p className="text-muted-foreground">Historical import is available to admins only.</p>;
  return <Importer />;
}

const Nums = ({ g }: { g: string[] }) => <span className="font-mono">{g.join(" ")}</span>;
const err = (e: unknown) => toast.error((e as any)?.message ?? String(e));

function Importer() {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  const [gameId, setGameId] = useState("");
  const [source, setSource] = useState("https://www.goldenchancelotto.com/");
  const [drawTime, setDrawTime] = useState("10:00");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const game = games.data?.find((g) => g.id === gameId);

  const batch = useQuery({
    queryKey: ["import-batch", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const [{ data: b, error: e1 }, { data: r, error: e2 }] = await Promise.all([
        supabase.from("import_batches").select("*").eq("id", batchId!).single(),
        supabase.from("import_rows").select("*, draw_result:draw_results(status)").eq("batch_id", batchId!).order("line_no"),
      ]);
      if (e1) throw e1; if (e2) throw e2;
      return { batch: b, rows: (r ?? []) as any[] };
    },
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of batch.data?.rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [batch.data]);

  function preview() {
    if (!game) { toast.error("Select a game first"); return; }
    setRows(parseMorningDew(text, { min: game.min_number, max: game.max_number }));
    setReviewed(false); setBatchId(null);
  }

  async function stage() {
    if (!rows || !game) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("stage_import", {
      _game_id: game.id, _source_url: source, _draw_time: drawTime,
      _rows: rows.map((r) => ({ line: r.line, raw: r.raw, drawNumber: r.drawNumber, date: r.date, group1: r.group1, group2: r.group2, error: r.error })),
    });
    setBusy(false);
    if (error) { err(error); return; }
    setBatchId(data as string); toast.success("Staged privately. Review server checks below.");
  }

  async function publish() {
    if (!batchId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("publish_import", { _batch_id: batchId });
    setBusy(false);
    if (error) { err(error); return; }
    toast.success(`${data} result(s) added as awaiting verification`);
    qc.invalidateQueries();
  }

  async function verifyAll() {
    const pending = (batch.data?.rows ?? []).filter((r) => r.status === "published" && r.draw_result?.status === "pending");
    if (!pending.length) return;
    setBusy(true);
    let ok = 0;
    for (const r of pending) {
      const { error } = await supabase.rpc("verify_result", { _result_id: r.result_id });
      if (error) { err(`Draw ${r.draw_number}: ${error.message}`); break; }
      ok++;
    }
    setBusy(false);
    toast.success(`${ok} result(s) verified and scored`);
    qc.invalidateQueries();
  }

  const valid = rows?.filter((r) => !r.error).length ?? 0;
  const pendingCount = (batch.data?.rows ?? []).filter((r) => r.status === "published" && r.draw_result?.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
        <div className="space-y-1"><Label>Game</Label>
          <Select value={gameId} onValueChange={(v) => { setGameId(v); setRows(null); setBatchId(null); }}>
            <SelectTrigger><SelectValue placeholder="Select country · provider · game" /></SelectTrigger>
            <SelectContent>{(games.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.provider?.name} · {g.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Format</Label><Input value="Golden Chance Morning-dew (two groups of five)" disabled /></div>
        <div className="space-y-1"><Label>Official source link</Label><Input value={source} onChange={(e) => setSource(e.target.value)} /></div>
        <div className="space-y-1"><Label>Draw time ({game?.timezone ?? "game timezone"})</Label><Input type="time" value={drawTime} onChange={(e) => setDrawTime(e.target.value)} /></div>
        <div className="space-y-1 md:col-span-2">
          <Label>Paste results or CSV</Label>
          <Textarea rows={8} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"0671: 01/01/2026: 3202891188 | 1013692163\n— or CSV —\n0671,01/01/2026,3202891188,1013692163"} />
          <p className="text-xs text-muted-foreground">Lines that don't start with a digit (titles, "[End …]", CSV headers) are ignored. Nothing is guessed or auto-corrected.</p>
        </div>
        <div className="md:col-span-2"><Button onClick={preview} disabled={!text.trim()}>Preview</Button></div>
      </div>

      {rows && !batchId && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Preview</h2>
            <Badge>{valid} valid</Badge>
            <Badge variant="destructive">{rows.length - valid} with errors</Badge>
          </div>
          <PreviewTable rows={rows.map((r) => ({ key: r.line, raw: r.raw, num: r.drawNumber, date: r.date, g1: r.group1, g2: r.group2, status: r.error ? "error" : "valid", msg: r.error }))} />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(!!v)} />I have reviewed every row against the source.</label>
          <Button disabled={!reviewed || !valid || busy} onClick={stage}>Stage privately</Button>
        </section>
      )}

      {batchId && batch.data && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Staged batch</h2>
            <Badge variant="secondary">{batch.data.batch.status}</Badge>
            {Object.entries(counts).map(([k, v]) => <Badge key={k} variant={k === "error" || k === "conflict" ? "destructive" : "outline"}>{v} {k}</Badge>)}
          </div>
          <p className="text-sm text-muted-foreground">Publishing adds results as <strong>awaiting verification</strong>. Error and conflict rows are never written; existing results are never overwritten.</p>
          <div className="flex flex-wrap gap-2">
            {batch.data.batch.status === "staged" && <Button disabled={busy || !counts["valid"]} onClick={publish}>Publish {counts["valid"] ?? 0} row(s)</Button>}
            {pendingCount > 0 && <Button variant="outline" disabled={busy} onClick={verifyAll}>Verify {pendingCount} against source &amp; score</Button>}
          </div>
          <PreviewTable rows={batch.data.rows.map((r) => ({ key: r.id, raw: r.raw_text, num: r.draw_number, date: r.draw_date, g1: r.group1, g2: r.group2, status: r.status === "published" && r.draw_result?.status === "verified" ? "verified" : r.status, msg: r.message }))} />
        </section>
      )}
    </div>
  );
}

type Row = { key: string | number; raw: string; num: string | null; date: string | null; g1: string[]; g2: string[]; status: string; msg: string | null };
function PreviewTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr><th className="p-2">Source text</th><th className="p-2">Draw</th><th className="p-2">Date</th><th className="p-2">Group 1</th><th className="p-2">Group 2</th><th className="p-2">Status</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t align-top">
              <td className="max-w-64 truncate p-2 font-mono text-xs text-muted-foreground" title={r.raw}>{r.raw}</td>
              <td className="p-2 font-mono">{r.num ?? "—"}</td>
              <td className="p-2 whitespace-nowrap">{r.date ?? "—"}</td>
              <td className="p-2"><Nums g={r.g1} /></td>
              <td className="p-2"><Nums g={r.g2} /></td>
              <td className="p-2"><Badge variant={["error", "conflict", "skipped"].includes(r.status) ? "destructive" : "outline"}>{r.status}</Badge>{r.msg && <div className="mt-1 text-xs text-destructive">{r.msg}</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
