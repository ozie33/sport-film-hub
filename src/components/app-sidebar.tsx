import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Film,
  TrendingUp,
  Scissors,
  Settings,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const primaryItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Games", url: "/games", icon: ClipboardList },
  { title: "Players", url: "/players", icon: Users },
  { title: "Film Room", url: "/film-room", icon: Film },
];

const secondaryItems = [
  { title: "Development", url: "/development", icon: TrendingUp },
  { title: "Reels", url: "/reels", icon: Scissors },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (router) => router.location.pathname });

  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-2 px-1 py-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
            CB
          </span>
          {!collapsed ? (
            <span className="label-caps truncate text-sm font-semibold">CourtBase</span>
          ) : null}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Film</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Development</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
