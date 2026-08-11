// TEMPORARY diagnostic route for Phase 3F rerun. Removed after the run.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cv-rerun-temp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!url.hostname.startsWith("localhost") && url.hostname !== "127.0.0.1") {
          return new Response("forbidden", { status: 403 });
        }
        const base = process.env["ANALYSIS_SERVICE_URL"]!;
        const key = process.env["ANALYSIS_SERVICE_API_KEY"] ?? "";
        const out: Record<string, unknown> = {};
        for (const path of ["/health", "/ready"]) {
          const res = await fetch(`${base}${path}`, { headers: { "x-api-key": key } });
          out[path] = { status: res.status, body: await res.json().catch(() => null) };
        }
        return Response.json(out);
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (!url.hostname.startsWith("localhost") && url.hostname !== "127.0.0.1") {
          return new Response("forbidden", { status: 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { submitAnalysis, advanceAnalysis } = await import(
          "@/lib/analysis/analysis-engine.server"
        );
        const body = (await request.json()) as Record<string, string>;
        const client = supabaseAdmin as never;
        if (body["jobId"]) {
          const job = await advanceAnalysis(client, body["jobId"]);
          return Response.json(job);
        }
        const job = await submitAnalysis(client, body["userId"]!, {
          gameId: body["gameId"]!,
          videoAssetId: body["videoAssetId"]!,
          playerId: body["playerId"]!,
        });
        return Response.json(job);
      },
    },
  },
});
