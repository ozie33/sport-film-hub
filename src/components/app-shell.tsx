import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { DemoBadge } from "@/components/common/demo-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/data/queries";
import { fullName, initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/domain";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (profile && !profile.onboarding_completed) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [profile, navigate]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const name = fullName(profile?.first_name, profile?.last_name) || "Your account";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
            <SidebarTrigger />
            <div className="flex min-w-0 items-center gap-2">
              {profile?.demo_mode ? <DemoBadge /> : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
                    {initials(profile?.first_name, profile?.last_name)}
                  </span>
                  <span className="hidden max-w-32 truncate sm:inline">{name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="space-y-0.5">
                  <p className="truncate text-sm">{name}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {profile?.primary_role ? ROLE_LABELS[profile.primary_role] : "Role not set"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <User className="size-4" /> Profile &amp; settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2">
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
