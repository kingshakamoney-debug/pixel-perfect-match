import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement, useUser } from "@/lib/auth";
import { fmt } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({ meta: [{ title: "Membership — LottoWizard" }, { name: "description", content: "Subscribe by bank transfer and track your payment." }, { property: "og:title", content: "Membership — LottoWizard" }, { property: "og:description", content: "Subscribe by bank transfer and track your payment." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: SubscriptionPage,
});

const err = (e: unknown) => toast.error((e as any)?.message ?? String(e));
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

const statusLabel: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

function SubscriptionPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const ent = useEntitlement(user?.id);

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await supabase.from("subscription_plans").select("*").eq("active", true).order("sort_order")).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => (await supabase.from("payment_settings").select("*").eq("id", 1).single()).data,
  });
  const requests = useQuery({
    queryKey: ["my-payments", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("payment_requests").select("*,plan:subscription_plans(name,duration_months)").order("created_at", { ascending: false })).data ?? [],
  });

  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const plan = (plans.data ?? []).find((p) => p.id === planId);
  const bankReady = !!(settings.data?.bank_name && settings.data?.account_number);
  const hasPending = (requests.data ?? []).some((r) => r.status === "pending_review");

  function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (!RECEIPT_TYPES.includes(f.type)) { toast.error("Receipt must be a PNG, JPG, WebP image or PDF"); return; }
    if (f.size > MAX_RECEIPT_BYTES) { toast.error("Receipt must be 5 MB or smaller"); return; }
    setFile(f);
  }

  async function submit() {
    if (!user) return;
    if (!plan) { toast.error("Choose a plan"); return; }
    const claimed = Number(amount);
    if (!claimed || claimed <= 0) { toast.error("Enter the amount you transferred"); return; }
    if (!date) { toast.error("Enter the transfer date"); return; }
    if (!reference.trim()) { toast.error("Enter the bank transaction reference"); return; }
    setBusy(true);
    try {
      let receipt_path: string | null = null;
      if (file) {
        receipt_path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("payment-evidence").upload(receipt_path, file);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("payment_requests").insert({
        user_id: user.id,
        plan_id: plan.id,
        claimed_amount: claimed,
        currency: plan.currency,
        transfer_date: date,
        transfer_reference: reference.trim(),
        description: description.trim() || null,
        receipt_path,
      });
      if (error) throw error;
      toast.success("Payment evidence submitted — an administrator will review it");
      setPlanId(""); setAmount(""); setDate(""); setReference(""); setDescription(""); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      qc.invalidateQueries({ queryKey: ["my-payments"] });
    } catch (e) { err(e); }
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Membership</h1>
        {ent.data && (
          <Badge variant={ent.data.allowed ? "default" : "secondary"}>
            {ent.data.allowed ? "Active" : "No active membership"}
            {ent.data.expires_at && ` · until ${fmt(ent.data.expires_at)}`}
          </Badge>
        )}
      </div>

      {ent.data?.allowed && ent.data.expires_at && (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          To renew, pay for a new plan before your expiry date — your access will be extended from {fmt(ent.data.expires_at)}, so you never lose paid time.
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">1 · Choose a plan and pay by bank transfer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(plans.data ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => { setPlanId(p.id); setAmount(String(p.price)); }}
                className={`rounded-xl border p-4 text-left transition-colors ${planId === p.id ? "border-primary bg-primary/10" : "hover:border-foreground/30"}`}
              >
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-muted-foreground">{p.currency} {Number(p.price).toLocaleString()}</div>
              </button>
            ))}
            {plans.data?.length === 0 && <p className="text-sm text-muted-foreground">No plans available yet.</p>}
          </div>
          {bankReady ? (
            <div className="space-y-1 rounded-lg bg-muted/50 p-4 text-sm">
              <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{settings.data!.bank_name}</span></div>
              <div><span className="text-muted-foreground">Account name:</span> <span className="font-medium">{settings.data!.account_name}</span></div>
              <div><span className="text-muted-foreground">Account number:</span> <span className="font-mono font-medium">{settings.data!.account_number}</span></div>
              {settings.data!.instructions && <p className="pt-1 text-muted-foreground">{settings.data!.instructions}</p>}
              {plan && <p className="pt-1">Transfer exactly <span className="font-semibold">{plan.currency} {Number(plan.price).toLocaleString()}</span> for the {plan.name} plan.</p>}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Bank transfer details are being set up — please check back shortly.</p>
          )}
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">2 · Submit your payment evidence</h2>
          {hasPending && <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">You already have a payment awaiting review. You can submit another once it is resolved.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Plan</Label>
              <Select value={planId} onValueChange={(v) => { setPlanId(v); const p = (plans.data ?? []).find((x) => x.id === v); if (p) setAmount(String(p.price)); }}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>{(plans.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.currency} {Number(p.price).toLocaleString()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Amount transferred {plan && `(${plan.currency})`}</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>Transfer date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Bank transaction reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Note (optional)</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Receipt / transfer evidence (image or PDF, max 5 MB)</Label>
            <Input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button disabled={busy || !bankReady} onClick={submit}><Upload className="mr-1 h-4 w-4" />Submit for review</Button>
          <p className="text-xs text-muted-foreground">Submitting evidence does not activate membership by itself — access starts when an administrator verifies your payment in the bank account.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Your payment requests</h2>
        <div className="overflow-hidden rounded-xl border">
          {(requests.data ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-4 text-sm last:border-0">
              <div>
                <div className="font-medium">{(r as any).plan?.name ?? "Plan"} · {r.currency} {Number(r.claimed_amount).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">
                  ref {r.transfer_reference} · submitted {fmt(r.created_at)}
                  {r.status === "approved" && r.granted_months && ` · ${r.granted_months} month(s) granted`}
                  {r.status === "rejected" && r.rejection_reason && ` · ${r.rejection_reason}`}
                </div>
              </div>
              <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{statusLabel[r.status] ?? r.status}</Badge>
            </div>
          ))}
          {requests.data?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No payment requests yet.</p>}
        </div>
        <p className="text-sm text-muted-foreground">Premium forecasts appear on your <Link to="/dashboard" className="underline">Forecasts page</Link> once a payment is approved.</p>
      </section>
    </div>
  );
}
