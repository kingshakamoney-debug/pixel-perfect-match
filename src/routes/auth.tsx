import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidHandle, normalizeHandle } from "@/lib/handles";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — LottoWizard" },
      { name: "description", content: "Sign in or create your LottoWizard account." },
      { property: "og:title", content: "Sign in — LottoWizard" },
      { property: "og:description", content: "Access premium lotto forecasts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [handleError, setHandleError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && navigate({ to: "/dashboard" }));
    const { data } = supabase.auth.onAuthStateChange((e) => e === "SIGNED_IN" && navigate({ to: "/dashboard" }));
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    } else {
      const normalizedHandle = normalizeHandle(handle);
      if (!isValidHandle(normalizedHandle)) {
        setHandleError("Use 3–40 letters, numbers or underscores.");
        setBusy(false);
        return;
      }
      const { data: available, error: availabilityError } = await supabase.rpc("is_handle_available", { _handle: normalizedHandle });
      if (availabilityError || !available) {
        setHandleError(availabilityError ? "Could not check your handle. Please try again." : "That handle is taken. Choose another.");
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin, data: { handle: normalizedHandle } },
      });
      if (error) toast.error(error.message); else setSent(true);
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(String(r.error.message ?? r.error));
  }

  if (sent) return <p className="mx-auto max-w-sm rounded-xl border p-6 text-center">Check your email to confirm your account, then sign in.</p>;

  return (
    <div className="mx-auto max-w-sm space-y-6 rounded-xl border bg-card p-6">
      <h1 className="text-2xl font-bold">{mode === "in" ? "Sign in" : "Create account"}</h1>
      <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
      <form onSubmit={submit} className="space-y-4">
        {mode === "up" && (
          <div className="space-y-1">
            <Label htmlFor="signup-handle">User handle</Label>
            <Input id="signup-handle" autoComplete="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_]{3,40}" value={handle} aria-invalid={!!handleError} aria-describedby={handleError ? "handle-error" : undefined} onChange={(e) => { setHandle(e.target.value); setHandleError(""); }} />
            {handleError && <p id="handle-error" role="alert" className="text-sm text-destructive">{handleError}</p>}
          </div>
        )}
        <div className="space-y-1"><Label htmlFor="auth-email">Email</Label><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="auth-password">Password</Label><Input id="auth-password" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
      </form>
      <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
      </Button>
    </div>
  );
}
