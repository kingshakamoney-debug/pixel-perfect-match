import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Payment review — LottoWizard" }, { name: "description", content: "Review and verify bank-transfer subscription payments." }] }),
  component: PaymentsAdmin,
});

const err = (e: unknown) => toast.error((e as any)?.message ?? String(e));

const REJECTION_REASONS = [
  "Payment not found",
  "Amount mismatch",
  "Invalid or unreadable evidence",
  "Duplicate transaction",
  "Incorrect transfer reference",
  "Other",
];

type Request = {
  id: string; user_id: string; claimed_amount: number; currency: string; transfer_date: string;
  transfer_reference: string; description: string | null; receipt_path: string | null; status: string;
  created_at: string; rejection_reason: string | null; verified_amount: number | null; granted_months: number | null;
  plan: { name: string; duration_months: number; price: number } | null;
  profile: { display_name: string | null } | null;
};

function useRequests() {
  return useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_requests")
        .select("*,plan:subscription_plans(name,duration_months,price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id,display_name").in("user_id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null })) as Request[];
    },
  });
}

async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from("payment-evidence").createSignedUrl(path, 300);
  if (error) { err(error); return; }
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

function PaymentsAdmin() {
  const qc = useQueryClient();
  const requests = useRequests();
  const [reviewing, setReviewing] = useState<Request | null>(null);
  const [rejecting, setRejecting] = useState<Request | null>(null);
  const pending = (requests.data ?? []).filter((r) => r.status === "pending_review");
  const decided = (requests.data ?? []).filter((r) => r.status !== "pending_review");

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold">Review queue ({pending.length})</h2>
        <div className="overflow-hidden rounded-xl border">
          {pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 text-sm last:border-0">
              <div>
                <div className="font-medium">{r.profile?.display_name ?? r.user_id.slice(0, 8)} · {r.plan?.name ?? "Plan"} · {r.currency} {Number(r.claimed_amount).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">ref {r.transfer_reference} · transfer date {r.transfer_date} · submitted {fmt(r.created_at)}</div>
              </div>
              <div className="flex gap-2">
                {r.receipt_path && <Button size="sm" variant="outline" onClick={() => receiptUrl(r.receipt_path!)}>View receipt</Button>}
                <Button size="sm" onClick={() => setReviewing(r)}>Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => setRejecting(r)}>Reject</Button>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="p-6 text-sm text-muted-foreground">No payments waiting for review.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">History</h2>
        <div className="overflow-hidden rounded-xl border">
          {decided.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-4 text-sm last:border-0">
              <div>
                <div className="font-medium">{r.profile?.display_name ?? r.user_id.slice(0, 8)} · {r.plan?.name ?? "Plan"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.status === "approved"
                    ? `verified ${r.verified_amount} ${r.currency} · ${r.granted_months} month(s) granted`
                    : `rejected — ${r.rejection_reason}`}
                  {" · "}{fmt(r.created_at)}
                </div>
              </div>
              <Badge variant={r.status === "approved" ? "default" : "destructive"}>{r.status}</Badge>
            </div>
          ))}
          {decided.length === 0 && <p className="p-6 text-sm text-muted-foreground">No reviewed payments yet.</p>}
        </div>
      </section>

      <ApproveDialog request={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); qc.invalidateQueries({ queryKey: ["admin-payments"] }); }} />
      <RejectDialog request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); qc.invalidateQueries({ queryKey: ["admin-payments"] }); }} />
    </div>
  );
}

function ApproveDialog({ request, onClose, onDone }: { request: Request | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever a different request is opened.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (request && request.id !== seededFor) {
    setSeededFor(request.id);
    setAmount(String(request.claimed_amount));
    setMonths(String(request.plan?.duration_months ?? 1));
    setReference(request.transfer_reference);
  }

  const mismatch = request && Number(amount) !== Number(request.claimed_amount);

  async function approve() {
    if (!request) return;
    const verified = Number(amount);
    const m = Number(months);
    if (!verified || verified <= 0) { toast.error("Enter the actual amount received"); return; }
    if (!m || m <= 0) { toast.error("Enter the duration to grant (months)"); return; }
    if (!reference.trim()) { toast.error("Enter the verified bank transaction reference"); return; }
    if (mismatch && !window.confirm(`The verified amount (${verified}) differs from the claimed amount (${request.claimed_amount}). Approve anyway?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("approve_payment", {
      _request_id: request.id,
      _verified_amount: verified,
      _currency: request.currency,
      _months: m,
      _reference: reference.trim(),
    });
    setBusy(false);
    if (error) { err(error); return; }
    toast.success("Payment approved — subscription activated");
    onDone();
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Approve payment</DialogTitle></DialogHeader>
        {request && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium">{request.profile?.display_name ?? request.user_id.slice(0, 8)} · {request.plan?.name ?? "Plan"}</div>
              <div className="text-xs text-muted-foreground">claims {request.currency} {Number(request.claimed_amount).toLocaleString()} · ref {request.transfer_reference} · {request.transfer_date}</div>
              {request.description && <div className="pt-1 text-xs text-muted-foreground">{request.description}</div>}
              {request.receipt_path && <Button size="sm" variant="link" className="px-0" onClick={() => receiptUrl(request.receipt_path!)}>Open receipt</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Confirm the money has actually arrived in the bank account before approving. The duration granted is your decision, not the customer's claim.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Amount received ({request.currency})</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1"><Label>Duration to grant (months)</Label><Input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Verified bank transaction reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            {mismatch && <p className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">Warning: the amount received differs from the customer's claimed amount of {request.currency} {Number(request.claimed_amount).toLocaleString()}.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={busy} onClick={approve}>Approve & activate</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ request, onClose, onDone }: { request: Request | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (request && request.id !== seededFor) { setSeededFor(request.id); setReason(""); setDetail(""); }

  async function reject() {
    if (!request) return;
    if (!reason) { toast.error("Choose a rejection reason"); return; }
    const full = reason === "Other" ? detail.trim() : detail.trim() ? `${reason}: ${detail.trim()}` : reason;
    if (!full) { toast.error("Explain the reason"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("reject_payment", { _request_id: request.id, _reason: full });
    setBusy(false);
    if (error) { err(error); return; }
    toast.success("Payment rejected");
    onDone();
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject payment</DialogTitle></DialogHeader>
        {request && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{request.profile?.display_name ?? request.user_id.slice(0, 8)} · {request.currency} {Number(request.claimed_amount).toLocaleString()} · ref {request.transfer_reference}</p>
            <div className="space-y-1"><Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>{REJECTION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Explanation {reason === "Other" && "(required)"}</Label><Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Rejecting grants no access. The customer can submit a corrected request afterwards.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="destructive" disabled={busy} onClick={reject}>Reject payment</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
