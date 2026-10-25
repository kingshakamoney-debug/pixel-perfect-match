import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countrySchema, providerSchema } from "./provider-schema";
import { gameCode } from "./game-schema";

export const countriesQuery = { queryKey: ["countries"], queryFn: async () => {
  const { data, error } = await supabase.from("countries").select("id,name,code").order("name");
  if (error) throw error;
  return data;
} };

export function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) {
  const countries = useQuery(countriesQuery);
  return <div className="space-y-2"><Label htmlFor={id}>Country</Label>
    <Select value={value} onValueChange={onChange} disabled={countries.isPending || Boolean(countries.error)}>
      <SelectTrigger id={id}><SelectValue placeholder="Select country" /></SelectTrigger>
      <SelectContent>{countries.data?.map((country) => <SelectItem key={country.id} value={country.id}>{country.name}</SelectItem>)}</SelectContent>
    </Select>
    {countries.error && <p className="text-sm text-destructive">Could not load countries.</p>}
  </div>;
}

export function ProviderSetup({ onProviderAdded }: { onProviderAdded: (provider: { id: string; country_id: string | null; timezone: string }) => void }) {
  const qc = useQueryClient();
  const countries = useQuery(countriesQuery);
  const [country, setCountry] = useState({ name: "", code: "" });
  const [provider, setProvider] = useState({ country_id: "", name: "", slug: "", timezone: "Africa/Accra" });
  const [busy, setBusy] = useState<"country" | "provider" | null>(null);

  async function addCountry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = countrySchema.safeParse(country);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check country details"); return; }
    setBusy("country");
    try {
      const { data, error } = await supabase.from("countries").insert(parsed.data).select("id").single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["countries"] });
      setProvider((current) => ({ ...current, country_id: data.id }));
      setCountry({ name: "", code: "" });
      toast.success("Country added");
    } catch (error) { showError(error, "That country code already exists."); }
    finally { setBusy(null); }
  }

  async function addProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = providerSchema.safeParse(provider);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check provider details"); return; }
    setBusy("provider");
    try {
      const { data, error } = await supabase.from("providers").insert(parsed.data).select("id,country_id,timezone").single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["game-providers"] });
      onProviderAdded(data);
      setProvider((current) => ({ ...current, name: "", slug: "" }));
      toast.success("Provider added");
    } catch (error) { showError(error, "That provider code already exists."); }
    finally { setBusy(null); }
  }

  return <>
    <section>
      <h2 className="mb-4 text-xl font-semibold">Add country</h2>
      <form onSubmit={addCountry} className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="country-name">Country name</Label><Input id="country-name" required value={country.name} onChange={(e) => setCountry({ ...country, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="country-code">Country code</Label><Input id="country-code" required maxLength={2} placeholder="GH" value={country.code} onChange={(e) => setCountry({ ...country, code: e.target.value.toUpperCase() })} /></div>
        <div><Button type="submit" disabled={busy !== null}><Plus className="mr-2 h-4 w-4" />{busy === "country" ? "Adding…" : "Add country"}</Button></div>
      </form>
      <p className="mt-3 text-sm text-muted-foreground">{countries.data?.map((c) => `${c.name} (${c.code})`).join(" · ")}</p>
    </section>
    <section>
      <h2 className="mb-4 text-xl font-semibold">Add provider</h2>
      <form onSubmit={addProvider} className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <CountrySelect id="provider-country" value={provider.country_id} onChange={(id) => setProvider({ ...provider, country_id: id })} />
        <div className="space-y-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" required value={provider.name} onChange={(e) => { const name = e.target.value; setProvider((p) => ({ ...p, name, slug: p.slug === gameCode(p.name) ? gameCode(name) : p.slug })); }} /></div>
        <div className="space-y-2"><Label htmlFor="provider-code">Unique provider code</Label><Input id="provider-code" required value={provider.slug} onChange={(e) => setProvider({ ...provider, slug: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="provider-timezone">Provider timezone</Label><Input id="provider-timezone" required value={provider.timezone} onChange={(e) => setProvider({ ...provider, timezone: e.target.value })} /></div>
        <div><Button type="submit" disabled={busy !== null || !provider.country_id}><Plus className="mr-2 h-4 w-4" />{busy === "provider" ? "Adding…" : "Add provider"}</Button></div>
      </form>
    </section>
  </>;
}

function showError(error: unknown, duplicateMessage: string) {
  const failure = error as { code?: string; message?: string };
  toast.error(failure.code === "23505" ? duplicateMessage : failure.message ?? "Could not save details");
}