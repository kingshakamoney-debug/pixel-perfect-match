import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsSuperadmin, useUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/members")({
  head: () => ({ meta: [{ title: "Members — LottoWizard" }, { name: "description", content: "Manage administrator access." }] }),
  component: MembersAdmin,
});

type Member = { user_id: string; display_name: string | null; account_status: string; roles: string[]; created_at: string };

function MembersAdmin() {
  const { user } = useUser();
  const superadmin = useIsSuperadmin(user?.id);
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["members"],
    enabled: !!superadmin.data,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_members");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  if (superadmin.isLoading) return null;
  if (!superadmin.data) {
    return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Only the superadmin can manage members and roles.</p>;
  }

  async function grant(target: string) {
    const { error } = await supabase.rpc("grant_admin", { _target_user: target });
    if (error) { toast.error(error.message); return; }
    toast.success("Admin role granted");
    qc.invalidateQueries({ queryKey: ["members"] });
  }

  async function revoke(target: string) {
    const { error } = await supabase.rpc("revoke_admin", { _target_user: target });
    if (error) { toast.error(error.message); return; }
    toast.success("Admin role revoked");
    qc.invalidateQueries({ queryKey: ["members"] });
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">Members & roles</h2>
        <p className="text-xs text-muted-foreground">
          Admins can run daily operations (draws, forecasts, results, payments). Only you, the superadmin, can grant or revoke admin access. Every change is recorded in the audit log.
        </p>
      </div>
      <div className="divide-y rounded-lg border">
        {(members.data ?? []).map((m) => {
          const isSuper = m.roles.includes("superadmin");
          const isAdmin = isSuper || m.roles.includes("admin");
          return (
            <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <span className="font-medium">{m.display_name || "Unnamed member"}</span>
                <span className="ml-2 text-xs text-muted-foreground">joined {new Date(m.created_at).toLocaleDateString()}</span>
                <div className="mt-1 flex gap-1.5">
                  {isSuper && <Badge>Superadmin</Badge>}
                  {m.roles.includes("admin") && <Badge variant="secondary">Admin</Badge>}
                  {!isAdmin && <Badge variant="outline">Member</Badge>}
                </div>
              </div>
              {!isSuper && (
                isAdmin ? (
                  <Button size="sm" variant="outline" onClick={() => revoke(m.user_id)}>Revoke admin</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => grant(m.user_id)}>Make admin</Button>
                )
              )}
            </div>
          );
        })}
        {members.data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">No members yet.</p>}
      </div>
    </section>
  );
}
