import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchGames } from "@/lib/data";
import { useIsAdmin, useUser } from "@/lib/auth";
import { gameCode, gameSchema } from "@/components/admin/game-schema";
import { CountrySelect, ProviderSetup } from "@/components/admin/provider-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/games")({
  head: () => ({ meta: [{ title: "Games — LottoWizard" }, { name: "description", content: "Manage LottoWizard games, providers and number rules." }, { property: "og:title", content: "Games — LottoWizard" }, { property: "og:description", content: "Manage LottoWizard games, providers and number rules." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: GamesAdmin,
});

const initial = { provider_id: "", name: "", slug: "", timezone: "Africa/Accra", min_number: "1", max_number: "90", numbers_drawn: "5", numbers_per_combination: "5", min_match_threshold: "2" };
const numberFields = [{ key: "min_number", label: "Minimum number" }, { key: "max_number", label: "Maximum number" }, { key: "numbers_drawn", label: "Winning numbers drawn" }, { key: "numbers_per_combination", label: "Numbers per forecast" }, { key: "min_match_threshold", label: "Matches needed for success" }] as const;

function GamesAdmin() {
  const { user } = useUser();
  const admin = useIsAdmin(user?.id);
  if (admin.isLoading || !user) return null;
  if (!admin.data) return <p className="text-muted-foreground">Game management is available to admins only.</p>;
  return <GameManager />;
}

function GameManager() {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  const providers = useQuery({ queryKey: ["game-providers"], queryFn: async () => {
    const { data, error } = await supabase.from("providers").select("id,name,slug,timezone,country_id,country:countries(name)").eq("status", "active").order("name");
    if (error) throw error;
    return data;
  } });
  const [form, setForm] = useState(initial);
  const [countryId, setCountryId] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = gameSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check the game rules"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("games").insert(parsed.data);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["games"] });
      toast.success("Game added");
      setForm({ ...initial, provider_id: form.provider_id, timezone: form.timezone });
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      toast.error(failure.code === "23505" ? "That game code already exists. Choose a different code." : failure.message ?? "Could not add game");
    } finally { setBusy(false); }
  }

  return <div className="space-y-8">
    <ProviderSetup onProviderAdded={(provider) => { setCountryId(provider.country_id ?? ""); setForm((f) => ({ ...f, provider_id: provider.id, timezone: provider.timezone })); }} />
    <section>
      <h2 className="mb-4 text-xl font-semibold">Add game</h2>
      <form onSubmit={create} className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <CountrySelect id="game-country" value={countryId} onChange={(id) => { setCountryId(id); setForm((f) => ({ ...f, provider_id: "" })); }} />
        <div className="space-y-2"><Label htmlFor="game-provider">Provider</Label>
          <Select disabled={!countryId || providers.isPending} value={form.provider_id} onValueChange={(id) => { const provider = providers.data?.find((p) => p.id === id); setForm((f) => ({ ...f, provider_id: id, timezone: provider?.timezone ?? f.timezone })); }}>
            <SelectTrigger id="game-provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>{providers.data?.filter((p) => p.country_id === countryId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label htmlFor="game-name">Game name</Label><Input id="game-name" required value={form.name} onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, slug: f.slug === gameCode(f.name) ? gameCode(name) : f.slug })); }} /></div>
        <div className="space-y-2"><Label htmlFor="game-code">Unique game code</Label><Input id="game-code" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="game-timezone">Timezone</Label><Input id="game-timezone" required value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
        {numberFields.map(({ key, label }) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label}</Label><Input id={key} type="number" required step={1} min={key === "min_number" || key === "max_number" ? undefined : 1} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
        <div className="flex items-end"><Button type="submit" disabled={busy || providers.isPending || !form.provider_id}><Plus className="mr-2 h-4 w-4" />{busy ? "Adding…" : "Add game"}</Button></div>
      </form>
      {providers.error && <p className="mt-3 text-sm text-destructive">Could not load providers.</p>}
    </section>
    <section>
      <h2 className="mb-4 text-xl font-semibold">Games</h2>
      {games.isPending && <p className="text-muted-foreground">Loading games…</p>}
      {games.error && <p className="text-destructive">Could not load games.</p>}
      <div className="divide-y border-y">{games.data?.map((game) => <div key={game.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><h3 className="font-medium">{game.name}</h3><p className="text-sm text-muted-foreground">{providers.data?.find((p) => p.id === game.provider?.id)?.country?.name ?? "Country not assigned"} · {game.provider?.name} · {game.timezone}</p></div>
        <p className="text-sm text-muted-foreground">{game.min_number}–{game.max_number} · {game.numbers_drawn} drawn · {game.numbers_per_combination} per forecast · {game.min_match_threshold}+ matches</p>
      </div>)}</div>
    </section>
  </div>;
}