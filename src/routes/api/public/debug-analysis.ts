import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/debug-analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
        if (!token) return new Response("unauthorized", { status: 401 });
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              h.set("apikey", key);
              h.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers: h });
            },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("unauthorized", { status: 401 });
        const body = (await request.json()) as Record<string, string>;
        try {
          const { submitAnalysis, advanceAnalysis } = await import(
            "@/lib/analysis/analysis-engine.server"
          );
          if (body["jobId"]) {
            const job = (await advanceAnalysis(supabase as never, body["jobId"])) as Record<
              string,
              unknown
            >;
            return Response.json({
              ok: true,
              status: job["status"],
              stage: job["current_stage"],
              progress: job["progress_percent"],
            });
          }
          const job = await submitAnalysis(supabase as never, userId, body as never);
          return Response.json({ ok: true, jobId: (job as { id: string }).id });
        } catch (error) {
          return Response.json({
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack?.slice(0, 1200) : null,
          });
        }
      },
    },
  },
});
