import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanManageContent, useUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import logo from "@/assets/lottowizard-logo.png.asset.json";

export function SiteHeader() {
  const { user } = useUser();
  const { data: isAdmin } = useCanManageContent(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = { className: "text-sm text-foreground font-medium" };

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src={logo.url} alt="LottoWizard" className="h-9 w-9 rounded-full object-cover" />
          <span>LottoWizard</span>
        </Link>
        <nav className="flex flex-1 items-center gap-5 overflow-x-auto">
          <Link to="/archive" className={link} activeProps={active}>Results</Link>
          <Link to="/history" className={link} activeProps={active}>History</Link>
          <Link to="/performance" className={link} activeProps={active}>Performance</Link>
          {user && <Link to="/dashboard" className={link} activeProps={active}>Forecasts</Link>}
          {user && <Link to="/subscription" className={link} activeProps={active}>Membership</Link>}
          {isAdmin && <Link to="/admin" className={link} activeProps={active}>Admin</Link>}
        </nav>
        {user ? (
          <Button size="sm" variant="outline" onClick={signOut}>Sign out</Button>
        ) : (
          <Button size="sm" asChild><Link to="/auth">Sign in</Link></Button>
        )}
      </div>
    </header>
  );
}

export function Balls({ numbers, hits, size }: { numbers: number[]; hits?: Set<number>; size?: "sm" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {numbers.map((n) => (
        <span key={n} className={`ball ${hits?.has(n) ? "ball-hit" : ""} ${size === "sm" ? "h-7 w-7 text-xs" : ""}`}>{String(n).padStart(2, "0")}</span>
      ))}
    </div>
  );
}
