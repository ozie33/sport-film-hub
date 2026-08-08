import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  advanceAnalysis,
  cancelAnalysis,
  submitAnalysis,
  type SubmitInput,
} from "@/lib/analysis/analysis-engine.server";

export const startAnalysisJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubmitInput) => input)
  .handler(({ data, context }) => submitAnalysis(context.supabase, context.userId, data));

export const pollAnalysisJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(({ data, context }) => advanceAnalysis(context.supabase, data.jobId));

export const cancelAnalysisJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(({ data, context }) => cancelAnalysis(context.supabase, data.jobId));

/**
 * Provider visibility for the admin/debug panel. Reports whether a real CV
 * endpoint is configured — never exposes the URL or API key.
 */
export const getAnalysisServiceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { hasRealAnalysisService, mockExplicitlyEnabled, resolveAnalysisSettings } = await import(
      "@/lib/analysis/provider.server"
    );
    const real = hasRealAnalysisService();
    return {
      provider: real ? ("external" as const) : mockExplicitlyEnabled() ? ("mock" as const) : null,
      label: real ? ("REAL CV" as const) : ("MOCK / DEMO" as const),
      configured: real,
      mockEnabled: mockExplicitlyEnabled(),
      hasApiKey: Boolean(process.env["ANALYSIS_SERVICE_API_KEY"]),
      settings: resolveAnalysisSettings(),
    };
  });
