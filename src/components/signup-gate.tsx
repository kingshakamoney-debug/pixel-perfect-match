import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function SignupGate() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center">
      <h1 className="text-2xl font-bold">Past results are free to view</h1>
      <p className="mt-3 text-muted-foreground">
        Create a free account or sign in to browse every past winning and machine number.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild><Link to="/auth">Create free account</Link></Button>
        <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
      </div>
    </div>
  );
}
