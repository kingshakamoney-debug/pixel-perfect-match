import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useIsAdmin, useIsSuperadmin, useUser } from "@/lib/auth";
import { BootstrapAdmin } from "@/components/admin/bootstrap";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — LottoWizard" }, { name: "description", content: "LottoWizard administration." }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user } = useUser();
  const admin = useIsAdmin(user?.id);
  const superadmin = useIsSuperadmin(user?.id);
  if (admin.isLoading || !user) return null;
  if (!admin.data) return <BootstrapAdmin onDone={() => admin.refetch()} />;
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = { className: "text-sm text-foreground font-medium" };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-6">
        <h1 className="text-3xl font-bold">Admin</h1>
        <nav className="flex items-center gap-5">
          <Link to="/admin" activeOptions={{ exact: true }} className={link} activeProps={active}>Operations</Link>
          <Link to="/admin/payments" className={link} activeProps={active}>Payments</Link>
          <Link to="/admin/settings" className={link} activeProps={active}>Settings</Link>
          {superadmin.data && <Link to="/admin/members" className={link} activeProps={active}>Members</Link>}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
