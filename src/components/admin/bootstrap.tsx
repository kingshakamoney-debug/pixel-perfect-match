import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** One-time claim of the superadmin role; hidden once a superadmin exists. */
export function BootstrapAdmin({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function claim() {
    setBusy(true);
    const { data, error } = await supabase.rpc("bootstrap_admin");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data) { toast.success("You are now the superadministrator"); onDone(); }
    else toast.error("A superadministrator already exists. Ask them to grant you admin access.");
  }
  return (
    <div className="max-w-md space-y-3 rounded-xl border bg-card p-6">
      <h2 className="font-semibold">No superadministrator yet</h2>
      <p className="text-sm text-muted-foreground">
        This site has no superadministrator. The first person to claim the role becomes the superadmin — this can only happen once. The superadmin can later grant admin access to others.
      </p>
      <Button disabled={busy} onClick={claim}>Claim superadmin role</Button>
    </div>
  );
}
