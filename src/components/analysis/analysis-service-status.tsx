import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu } from "lucide-react";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { getAnalysisServiceStatus } from "@/lib/analysis/analysis.functions";

/**
 * Honest reporting of which analysis service is active. Credentials are never
 * exposed — only whether a real endpoint is configured.
 */
export function AnalysisServiceStatus() {
  const fetchStatus = useServerFn(getAnalysisServiceStatus);
  const { data } = useQuery({
    queryKey: ["analysis-service-status"],
    queryFn: () => fetchStatus(),
  });

  return (
    <SectionCard
      title="AI Analysis Service"
      description="Player identification, tracking and candidate clip generation."
      actions={
        data ? (
          <span
            className={
              data.configured
                ? "label-caps inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/15 px-2.5 py-0.5 text-[11px] text-success"
                : "label-caps inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-[11px] text-warning"
            }
          >
            <Cpu className="size-3" />
            {data.label}
          </span>
        ) : null
      }
    >
      {!data ? (
        <p className="text-sm text-muted-foreground">Checking the analysis service…</p>
      ) : data.configured ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            A production computer-vision service is connected. Every run produces real detections,
            tracks and candidate clips from your film.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Tag>Endpoint configured</Tag>
            <Tag>{data.hasApiKey ? "API key set" : "No API key"}</Tag>
            <Tag>{data.settings.analysisFps} fps sampling</Tag>
            <Tag>{data.settings.detectionResolution}px detection</Tag>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No computer-vision service is connected yet, so analysis runs will fail with “Analysis
            service unavailable” instead of producing demo results.
            {data.mockEnabled
              ? " The development mock provider is explicitly enabled and every result it creates is labelled DEMO."
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Deploy the service in <span className="font-mono">cv-service/</span>, then set the
            analysis service URL and API key.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
