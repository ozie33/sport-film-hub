import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Internal metrics: admin-only, verified through the caller's own session. */
export const getProductAnalyticsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rangeDays?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Admins only");

    const { computeProductAnalytics } = await import("@/lib/analytics/analytics.server");
    const rangeDays = Math.min(Math.max(data.rangeDays ?? 30, 1), 365);
    return computeProductAnalytics(context.supabase, rangeDays);
  });

/** Whether the signed-in user may see the internal analytics view. */
export const isAnalyticsAdminFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return { isAdmin: false };
    return { isAdmin: Boolean(data) };
  });
