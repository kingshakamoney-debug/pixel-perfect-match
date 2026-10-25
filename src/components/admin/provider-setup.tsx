import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countrySchema, providerSchema } from "./provider-schema";
import { gameCode } from "./game-schema";
import { RecordActions } from "./record-actions";

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
  const providers = useQuery({ queryKey: ["game-providers"], queryFn: async () => {
    const { data, error } = await supabase.from("providers").select("id,name,slug,timezone,country_id,country:countries(name)").order("name");
    if (error) throw error;
    return data;
  } });
  const [countryEdit, setCountryEdit] = useState<string | null>(null);
  const [providerEdit, setProviderEdit] = useState<string | null>(null);
  const [country, setCountry] = useState({ name: "", code: "" });
  const [provider, setProvider] = useState({ country_id: "", name: "", slug: "", timezone: "Africa/Accra" });
  const [busy, setBusy] = useState<"country" | "provider" | null>(null);

  async function addCountry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = countrySchema.safeParse(country);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check country details"); return; }
    setBusy("country");
    try {
      const query = countryEdit ? supabase.from("countries").update(parsed.data).eq("id", countryEdit) : supabase.from("countries").insert(parsed.data);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["countries"] });
      setProvider((current) => ({ ...current, country_id: data.id }));
      setCountry({ name: "", code: "" });
      setCountryEdit(null);
      await qc.invalidateQueries({ queryKey: ["game-providers"] });
      toast.success(countryEdit ? "Country updated" : "Country added");
    } catch (error) { showError(error, "That country code already exists."); }
    finally { setBusy(null); }
  }

  async function addProvider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = providerSchema.safeParse(provider);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check provider details"); return; }
    setBusy("provider");
    try {
      const query = providerEdit ? supabase.from("providers").update(parsed.data).eq("id", providerEdit) : supabase.from("providers").insert(parsed.data);
      const { data, error } = await query.select("id,country_id,timezone").single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["game-providers"] });
      onProviderAdded(data);
      setProvider((current) => ({ ...current, name: "", slug: "" }));
      setProviderEdit(null);
      await qc.invalidateQueries({ queryKey: ["games"] });
      toast.success(providerEdit ? "Provider updated" : "Provider added");
    } catch (error) { showError(error, "That provider code already exists."); }
    finally { setBusy(null); }
  }

  return <>
    <section>
      <h2 className="mb-4 text-xl font-semibold">{countryEdit ? "Edit country" : "Add country"}</h2>
      <form onSubmit={addCountry} className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="country-name">Country name</Label><Input id="country-name" required value={country.name} onChange={(e) => setCountry({ ...country, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="country-code">Country code</Label><Input id="country-code" required maxLength={2} placeholder="GH" value={country.code} onChange={(e) => setCountry({ ...country, code: e.target.value.toUpperCase() })} /></div>
        <div className="flex gap-2">{countryEdit && <Button type="button" variant="outline" onClick={() => { setCountryEdit(null); setCountry({ name: "", code: "" }); }}>Cancel</Button>}<Button type="submit" disabled={busy !== null}><Save className="mr-2 h-4 w-4" />{busy === "country" ? "Saving…" : countryEdit ? "Save country" : "Add country"}</Button></div>
      </form>
      <div className="mt-4 divide-y border-y">{countries.data?.map((c) => <div key={c.id} className="flex items-center justify-between gap-3 py-3"><span>{c.name} <span className="text-muted-foreground">({c.code})</span></span><RecordActions name={c.name} disabled={busy !== null} onEdit={() => { setCountryEdit(c.id); setCountry({ name: c.name, code: c.code }); document.getElementById("country-name")?.focus(); }} onDelete={async () => { const { error, data } = await supabase.from("countries").delete().eq("id", c.id).select("id").single(); if (error) throw error; if (!data) throw new Error("Country not deleted"); if (countryEdit === c.id) { setCountryEdit(null); setCountry({ name: "", code: "" }); } if (provider.country_id === c.id) setProvider((p) => ({ ...p, country_id: "" })); await qc.invalidateQueries(); toast.success("Country deleted"); }} /></div>)}</div>
    </section>
    <section>
      <h2 className="mb-4 text-xl font-semibold">{providerEdit ? "Edit provider" : "Add provider"}</h2>
      <form onSubmit={addProvider} className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <CountrySelect id="provider-country" value={provider.country_id} onChange={(id) => setProvider({ ...provider, country_id: id })} />
        <div className="space-y-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" required value={provider.name} onChange={(e) => { const name = e.target.value; setProvider((p) => ({ ...p, name, slug: p.slug === gameCode(p.name) ? gameCode(name) : p.slug })); }} /></div>
        <div className="space-y-2"><Label htmlFor="provider-code">Unique provider code</Label><Input id="provider-code" required value={provider.slug} onChange={(e) => setProvider({ ...provider, slug: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="provider-timezone">Provider timezone</Label><Input id="provider-timezone" required value={provider.timezone} onChange={(e) => setProvider({ ...provider, timezone: e.target.value })} /></div>
        <div className="flex gap-2">{providerEdit && <Button type="button" variant="outline" onClick={() => { setProviderEdit(null); setProvider({ country_id: "", name: "", slug: "", timezone: "Africa/Accra" }); }}>Cancel</Button>}<Button type="submit" disabled={busy !== null || !provider.country_id}><Save className="mr-2 h-4 w-4" />{busy === "provider" ? "Saving…" : providerEdit ? "Save provider" : "Add provider"}</Button></div>
      </form>
      <div className="mt-4 divide-y border-y">{providers.data?.map((p) => <div key={p.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{p.name}</p><p className="text-sm text-muted-foreground">{p.country?.name} · {p.timezone}</p></div><RecordActions name={p.name} disabled={busy !== null} onEdit={() => { setProviderEdit(p.id); setProvider({ country_id: p.country_id ?? "", name: p.name, slug: p.slug, timezone: p.timezone }); document.getElementById("provider-name")?.focus(); }} onDelete={async () => { const { error } = await supabase.from("providers").delete().eq("id", p.id).select("id").single(); if (error) throw error; if (providerEdit === p.id) { setProviderEdit(null); setProvider({ country_id: "", name: "", slug: "", timezone: "Africa/Accra" }); } await qc.invalidateQueries(); toast.success("Provider deleted"); }} /></div>)}</div>
      {providers.error && <p className="text-sm text-destructive">Could not load providers.</p>}
    </section>
  </>;
}

function showError(error: unknown, duplicateMessage: string) {
  const failure = error as { code?: string; message?: string };
  toast.error(failure.code === "23505" ? duplicateMessage : failure.message ?? "Could not save details");
}