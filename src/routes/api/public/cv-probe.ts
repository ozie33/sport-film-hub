import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cv-probe")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["ANALYSIS_SERVICE_URL"];
        let reach: unknown = null;
        if (url) {
          try {
            const res = await fetch(`${url.replace(/\/$/, "")}/ready`, {
              signal: AbortSignal.timeout(15000),
            });
            reach = { status: res.status };
          } catch (e) {
            reach = { error: e instanceof Error ? e.message : "err" };
          }
        }
        return Response.json({
          hasUrl: Boolean(url),
          urlHost: url ? new URL(url).host : null,
          hasKey: Boolean(process.env["ANALYSIS_SERVICE_API_KEY"]),
          keyLength: (process.env["ANALYSIS_SERVICE_API_KEY"] ?? "").length,
          provider: process.env["ANALYSIS_PROVIDER"] ?? null,
          reach,
        });
      },
    },
  },
});
