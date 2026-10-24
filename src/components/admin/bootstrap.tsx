import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** One-time claim of the first administrator role; hidden once any admin exists. */
export function BootstrapAdmin({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function claim() {
    setBusy(true);
    const { data, error } = await supabase.rpc("bootstrap_admin");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data) { toast.success("You are now the administrator"); onDone(); }
    else toast.error("An administrator already exists. Ask them to grant you access.");
  }
  return (
    <div className="max-w-md space-y-3 rounded-xl border bg-card p-6">
      <h2 className="font-semibold">No administrator yet</h2>
      <p className="text-sm text-muted-foreground">
        This site has no administrator. The first person to claim the role becomes the admin — this can only happen once.
      </p>
      <Button disabled={busy} onClick={claim}>Claim administrator role</Button>
    </div>
  );
}
