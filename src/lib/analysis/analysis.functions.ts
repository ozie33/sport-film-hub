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
