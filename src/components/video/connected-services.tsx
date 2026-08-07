import { useQuery } from "@tanstack/react-query";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceBadge } from "@/components/video/source-badge";
import { getProviderConnectionStates } from "@/lib/video/providers.functions";

/** Honest read-out of what each video provider integration can do today. */
export function ConnectedServices() {
  const { data, isPending } = useQuery({
    queryKey: ["provider-connection-states"],
    queryFn: () => getProviderConnectionStates(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <SectionCard
      title="Video Sources"
      description="Where your film can come from, and what each source unlocks"
    >
      {isPending || !data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="space-y-3">
          <li className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge provider="upload" />
              <Tag>Always available</Tag>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Uploaded film is stored privately and gives full frame access, so it can feed future
              analysis.
            </p>
          </li>
          <li className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge provider="youtube" />
              <Tag>{data.youtube.hasCredentials ? "API configured" : "Public links"}</Tag>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{data.youtube.detail}</p>
          </li>
          <li className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge provider="hudl" />
              <Tag>{data.hudl.status === "connected" ? "Connected" : "Link only"}</Tag>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{data.hudl.detail}</p>
          </li>
        </ul>
      )}
    </SectionCard>
  );
}