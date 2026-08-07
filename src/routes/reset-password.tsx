import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — CourtBase" },
      { name: "description", content: "Choose a new password for your CourtBase account." },
      { property: "og:title", content: "Set a new password — CourtBase" },
      { property: "og:description", content: "Choose a new password for your CourtBase account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold uppercase">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open this page from your password reset email.
        </p>
        <div className="mt-5 space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(inputEvent) => setPassword(inputEvent.target.value)}
          />
        </div>
        <Button type="submit" className="mt-5 w-full" disabled={busy}>
          Update password
        </Button>
      </form>
    </div>
  );
}
