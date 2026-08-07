import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { mode?: Mode | undefined } => ({
    mode:
      search['mode'] === "signup" || search['mode'] === "forgot"
        ? (search['mode'] as Mode)
        : ("signin" as Mode),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — CourtBase" },
      { name: "description", content: "Sign in or create your CourtBase player development account." },
      { property: "og:title", content: "Sign in — CourtBase" },
      { property: "og:description", content: "Access your player development film library." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/onboarding" });
          return;
        }
        setSent("Check your email to confirm your account, then sign in.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent("Password reset email sent. Check your inbox.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  const heading =
    mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset password" : "Sign in";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary font-display font-bold text-primary-foreground">
            CB
          </span>
          <span className="label-caps text-sm font-semibold">CourtBase</span>
        </Link>

        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold uppercase">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "We'll email you a link to set a new password."
              : "Athletes, parents, coaches and trainers."}
          </p>

          {sent ? (
            <p className="mt-5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              {sent}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(inputEvent) => setEmail(inputEvent.target.value)}
              />
            </div>
            {mode !== "forgot" ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                />
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
            </Button>
          </form>

          {mode !== "forgot" ? (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="label-caps text-[10px] text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
                Continue with Google
              </Button>
            </>
          ) : null}

          <div className="mt-6 space-y-2 text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                <button type="button" className="underline" onClick={() => setMode("signup")}>
                  Need an account? Sign up
                </button>
                <br />
                <button type="button" className="underline" onClick={() => setMode("forgot")}>
                  Forgot your password?
                </button>
              </>
            ) : (
              <button type="button" className="underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
