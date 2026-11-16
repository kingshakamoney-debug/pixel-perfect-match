import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanManageContent, useUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";
import logoUrl from "@/assets/lottowizard-logo.jpg";

export function SiteHeader() {
  const { user } = useUser();
  const { data: isAdmin } = useCanManageContent(user?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = { className: "text-sm text-foreground font-medium" };

  const close = () => setOpen(false);

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
          <img src={logoUrl} alt="LottoWizard" className="h-9 w-9 rounded-full object-cover" />
          <span>LottoWizard</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-5 md:flex">
          <Link to="/archive" className={link} activeProps={active} onClick={close}>Results</Link>
          <Link to="/history" className={link} activeProps={active} onClick={close}>History</Link>
          <Link to="/performance" className={link} activeProps={active} onClick={close}>Performance</Link>
          {user && <Link to="/dashboard" className={link} activeProps={active} onClick={close}>Forecasts</Link>}
          {user && <Link to="/subscription" className={link} activeProps={active} onClick={close}>Membership</Link>}
          {isAdmin && <Link to="/admin" className={link} activeProps={active} onClick={close}>Admin</Link>}
        </nav>
        <div className="hidden md:block">{user ? (
          <Button size="sm" variant="outline" onClick={() => { close(); signOut(); }}>Sign out</Button>
        ) : (
          <Button size="sm" asChild><Link to="/auth" onClick={close}>Sign in</Link></Button>
        )}</div>
        <div className="ml-auto md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button size="icon" variant="ghost" aria-label="Open menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle>Menu</SheetTitle>
              <nav className="mt-6 flex flex-col gap-4 [&>a]:text-base">
          <Link to="/archive" className={link} activeProps={active} onClick={close}>Results</Link>
          <Link to="/history" className={link} activeProps={active} onClick={close}>History</Link>
          <Link to="/performance" className={link} activeProps={active} onClick={close}>Performance</Link>
          {user && <Link to="/dashboard" className={link} activeProps={active} onClick={close}>Forecasts</Link>}
          {user && <Link to="/subscription" className={link} activeProps={active} onClick={close}>Membership</Link>}
          {isAdmin && <Link to="/admin" className={link} activeProps={active} onClick={close}>Admin</Link>}
              </nav>
              <div className="mt-6 [&>*]:w-full">{user ? (
          <Button size="sm" variant="outline" onClick={() => { close(); signOut(); }}>Sign out</Button>
        ) : (
          <Button size="sm" asChild><Link to="/auth" onClick={close}>Sign in</Link></Button>
        )}</div>
            </SheetContent>
          </Sheet>
        </div>
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
