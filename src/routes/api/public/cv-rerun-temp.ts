// TEMPORARY diagnostic route for Phase 3F rerun. Removed after the run.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cv-rerun-temp")({
  server: {
    handlers: {
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
