import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Payment settings — LottoWizard" }, { name: "description", content: "Configure bank details, plans and reminders." }, { property: "og:title", content: "Payment settings — LottoWizard" }, { property: "og:description", content: "Configure bank details, plans and reminders." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: SettingsAdmin,
});

const err = (e: unknown) => toast.error((e as any)?.message ?? String(e));

function SettingsAdmin() {
  const { user } = useUser();
  const admin = useIsAdmin(user?.id);
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => (await supabase.from("payment_settings").select("*").eq("id", 1).single()).data,
  });
  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => (await supabase.from("subscription_plans").select("*").order("sort_order")).data ?? [],
  });

  const [bank, setBank] = useState<{ bank_name: string; account_name: string; account_number: string; instructions: string; reminder_days: string } | null>(null);
  const current = bank ?? (settings.data ? {
    bank_name: settings.data.bank_name,
    account_name: settings.data.account_name,
    account_number: settings.data.account_number,
    instructions: settings.data.instructions,
    reminder_days: (settings.data.reminder_days ?? []).join(", "),
  } : null);

  const [newPlan, setNewPlan] = useState({ name: "", duration_months: "1", price: "", currency: "NGN" });
  const [busy, setBusy] = useState(false);

  async function saveSettings() {
    if (!current) return;
    const days = current.reminder_days.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
    if (days.length === 0) { toast.error("Reminder days must be comma-separated numbers, e.g. 7, 3, 1, 0"); return; }
    setBusy(true);
    const { error } = await supabase.from("payment_settings").update({
      bank_name: current.bank_name.trim(),
      account_name: current.account_name.trim(),
      account_number: current.account_number.trim(),
      instructions: current.instructions.trim(),
      reminder_days: days,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (!error) await supabase.rpc("log_admin_action", { _action: "update_payment_settings", _entity_type: "payment_settings", _reason: `Bank ${current.bank_name || "(unset)"} · reminders ${days.join("/")}d` });
    setBusy(false);
    if (error) { err(error); return; }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["payment-settings"] });
  }

  async function togglePlan(id: string, active: boolean) {
    const { error } = await supabase.from("subscription_plans").update({ active }).eq("id", id);
    if (error) { err(error); return; }
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  }

  async function deletePlan(id: string) {
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) { err(error); return; }
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  }

  async function addPlan() {
    const months = Number(newPlan.duration_months);
    const price = Number(newPlan.price);
    if (!newPlan.name.trim() || !months || months <= 0 || !(price >= 0)) { toast.error("Enter a name, duration and price"); return; }
    const { error } = await supabase.from("subscription_plans").insert({
      name: newPlan.name.trim(), duration_months: months, price, currency: newPlan.currency.trim() || "NGN",
      sort_order: (plans.data?.length ?? 0) + 1,
    });
    if (!error) await supabase.rpc("log_admin_action", { _action: "add_plan", _entity_type: "subscription_plan", _reason: `${newPlan.name} · ${months}mo · ${newPlan.currency} ${price}` });
    if (error) { err(error); return; }
    toast.success("Plan added");
    setNewPlan({ name: "", duration_months: "1", price: "", currency: "NGN" });
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  }

  if (admin.isLoading) return null;
  if (!admin.data) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Settings are available to full admins only.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Bank transfer details</h2>
        <p className="text-xs text-muted-foreground">Shown to signed-in customers on the Membership page. Never store banking passwords or PINs here.</p>
        {current && (
          <>
            <div className="space-y-1"><Label>Bank name</Label><Input value={current.bank_name} onChange={(e) => setBank({ ...current, bank_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Account name</Label><Input value={current.account_name} onChange={(e) => setBank({ ...current, account_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Account number</Label><Input value={current.account_number} onChange={(e) => setBank({ ...current, account_number: e.target.value })} /></div>
            <div className="space-y-1"><Label>Transfer instructions</Label><Textarea rows={3} value={current.instructions} onChange={(e) => setBank({ ...current, instructions: e.target.value })} /></div>
            <div className="space-y-1"><Label>Reminder days before expiry (comma-separated)</Label><Input value={current.reminder_days} onChange={(e) => setBank({ ...current, reminder_days: e.target.value })} placeholder="7, 3, 1, 0" /></div>
            <Button disabled={busy} onClick={saveSettings}>Save settings</Button>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Subscription plans</h2>
        <div className="space-y-2">
          {(plans.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground"> · {p.duration_months} month(s) · {p.currency} {Number(p.price).toLocaleString()}</span>
                {!p.active && <Badge variant="secondary" className="ml-2">hidden</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={p.active} onCheckedChange={(v) => togglePlan(p.id, v)} aria-label={`Show ${p.name}`} />
                <Button size="icon" variant="ghost" onClick={() => deletePlan(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-4">
          <div className="space-y-1"><Label>Name</Label><Input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="1 month" /></div>
          <div className="space-y-1"><Label>Months</Label><Input type="number" min={1} value={newPlan.duration_months} onChange={(e) => setNewPlan({ ...newPlan, duration_months: e.target.value })} /></div>
          <div className="space-y-1"><Label>Price</Label><Input type="number" min={0} value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })} /></div>
          <div className="space-y-1"><Label>Currency</Label><Input value={newPlan.currency} onChange={(e) => setNewPlan({ ...newPlan, currency: e.target.value })} /></div>
        </div>
        <Button variant="outline" onClick={addPlan}><Plus className="mr-1 h-4 w-4" />Add plan</Button>
      </section>
    </div>
  );
}
