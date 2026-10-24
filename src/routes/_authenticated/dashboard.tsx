import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement, useUser } from "@/lib/auth";
import { fmt } from "@/lib/data";
import { Balls } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your forecasts — LottoWizard" }, { name: "description", content: "Premium forecasts for upcoming draws." }, { property: "og:title", content: "Your forecasts — LottoWizard" }, { property: "og:description", content: "Premium forecasts for upcoming draws." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Dashboard,
});

const reasons: Record<string, string> = {
  admin: "Administrator access",
  active_subscription: "Active membership",
  trialing: "Free trial active",
  expired: "Your trial has ended",
  unpaid: "No active membership",
  suspended: "Account suspended",
};

function Dashboard() {
  const { user } = useUser();
  const ent = useEntitlement(user?.id);
  const forecasts = useQuery({
    queryKey: ["premium", user?.id],
    enabled: !!ent.data?.allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecasts")
        .select("id,forecast_type,version,published_at,draws!inner(scheduled_at,result_verified_at,game:games(name,provider:providers(name))),forecast_combinations(id,combination_number,forecast_numbers(number_value,number_type))")
        .eq("status", "published")
        .is("draws.result_verified_at", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const reminders = useQuery({
    queryKey: ["my-reminders", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("reminder_logs").select("id,days_before,expires_at,created_at").order("created_at", { ascending: false }).limit(5)).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Upcoming forecasts</h1>
        {ent.data && (
          <Badge variant={ent.data.allowed ? "default" : "secondary"}>
            {reasons[ent.data.reason] ?? ent.data.reason}
            {ent.data.expires_at && ` · until ${fmt(ent.data.expires_at)}`}
          </Badge>
        )}
      </div>
      {reminders.data && reminders.data.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/50 bg-primary/10 p-4">
          <p className="text-sm">
            Your membership expires on <span className="font-semibold">{fmt(reminders.data[0]!.expires_at)}</span>. Renew by bank transfer to keep your access — paid early renewals extend from your current expiry.
          </p>
          <Button size="sm" asChild><Link to="/subscription">Renew now</Link></Button>
        </div>
      )}
      {ent.data && !ent.data.allowed && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Premium forecasts are locked</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Become a member by bank transfer on the <Link to="/subscription" className="underline">Membership page</Link>. Past forecasts stay free on the History page.
          </p>
        </div>
      )}
      {ent.data?.allowed && forecasts.data?.length === 0 && <p className="text-muted-foreground">No forecasts published for upcoming draws yet.</p>}
      {(forecasts.data ?? []).map((f) => (
        <article key={f.id} className="rounded-xl border bg-card p-5">
          <div className="font-semibold">{f.draws.game?.provider?.name} · {f.draws.game?.name}</div>
          <div className="text-sm text-muted-foreground">Draw {fmt(f.draws.scheduled_at)} · published {fmt(f.published_at)} · v{f.version}</div>
          <div className="mt-4 space-y-2">
            {f.forecast_combinations.sort((a: any, b: any) => a.combination_number - b.combination_number).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-6 font-mono text-xs text-muted-foreground">#{c.combination_number}</span>
                <Balls numbers={c.forecast_numbers.map((n: any) => n.number_value).sort((a: number, b: number) => a - b)} />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
