import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ShareResourceType =
  | "game"
  | "playlist"
  | "film_review"
  | "reel"
  | "development_report";

/** Looks up an app user by email so a coach can share without exposing ids. */
export const findAppUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = (input?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    return { email };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw error;
    const match = list.users.find(
      (user) => (user.email ?? "").toLowerCase() === data.email,
    );
    if (!match) {
      return { found: false as const, email: data.email };
    }
    if (match.id === context.userId) {
      throw new Error("That's your own account.");
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, primary_role")
      .eq("id", match.id)
      .maybeSingle();
    return {
      found: true as const,
      userId: match.id,
      email: data.email,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      role: profile?.primary_role ?? null,
    };
  });

type SourceCheckResult = {
  assetId: string;
  label: string;
  provider: string;
  state: "ok" | "needs_grant" | "cannot_grant" | "provider_managed" | "no_connection";
  message: string;
};

/**
 * App-level permission and source-file permission are different things.
 * This reports the source side, in plain language, per film behind a share.
 */
export const checkShareSourceAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { resourceType: ShareResourceType; resourceId: string; email: string }) => {
    if (!input?.resourceId) throw new Error("Missing resource");
    if (!input?.email) throw new Error("Missing recipient email");
    return input;
  })
  .handler(async ({ data, context }) => {
    const assets = await resolveShareAssets(context.supabase, data.resourceType, data.resourceId);
    const { checkDriveViewerAccess } = await import("@/lib/drive/drive.server");
    const results: SourceCheckResult[] = [];

    for (const asset of assets) {
      if (asset.provider === "youtube") {
        results.push({
          assetId: asset.id,
          label: asset.label,
          provider: asset.provider,
          state: "ok",
          message: "Plays for anyone through the official YouTube player.",
        });
        continue;
      }
      if (asset.provider === "upload") {
        results.push({
          assetId: asset.id,
          label: asset.label,
          provider: asset.provider,
          state: "ok",
          message: "Stored in this app — shared viewers can watch it here.",
        });
        continue;
      }
      if (asset.provider === "hudl" || asset.provider === "external") {
        results.push({
          assetId: asset.id,
          label: asset.label,
          provider: asset.provider,
          state: "provider_managed",
          message: "Opening the source video may require access from the provider.",
        });
        continue;
      }
      if (asset.provider === "google_drive" && asset.external_video_id) {
        try {
          const check = await checkDriveViewerAccess(
            context.userId,
            asset.external_video_id,
            data.email,
          );
          if (check.state === "no_connection") {
            results.push({
              assetId: asset.id,
              label: asset.label,
              provider: asset.provider,
              state: "no_connection",
              message: "Connect your Google Drive account to check who can watch this film.",
            });
          } else if (check.state === "accessible" || check.state === "granted") {
            results.push({
              assetId: asset.id,
              label: asset.label,
              provider: asset.provider,
              state: "ok",
              message: "Already has access to the source video.",
            });
          } else {
            results.push({
              assetId: asset.id,
              label: asset.label,
              provider: asset.provider,
              state: check.canShare ? "needs_grant" : "cannot_grant",
              message: check.canShare
                ? "Does not currently have access to this source video."
                : "Does not have access, and your Google account can't share this file.",
            });
          }
        } catch (error) {
          console.error("Drive access check failed", error);
          results.push({
            assetId: asset.id,
            label: asset.label,
            provider: asset.provider,
            state: "cannot_grant",
            message: "We could not check access to this source video.",
          });
        }
      }
    }
    return { sources: results };
  });

/** Adds the recipient as a viewer on the underlying Drive file. */
export const grantShareSourceAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assetId: string; email: string }) => {
    if (!input?.assetId || !input?.email) throw new Error("Missing asset or recipient");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: asset, error } = await context.supabase
      .from("video_assets")
      .select("id, provider, external_video_id, label")
      .eq("id", data.assetId)
      .maybeSingle();
    if (error) throw error;
    if (!asset || asset.provider !== "google_drive" || !asset.external_video_id) {
      throw new Error("That film is not a Google Drive source.");
    }
    const { grantDriveViewerAccess } = await import("@/lib/drive/drive.server");
    const result = await grantDriveViewerAccess(
      context.userId,
      asset.external_video_id,
      data.email,
    );
    if (result.state === "granted") {
      await context.supabase
        .from("video_assets")
        .update({ permissions_status: "shared" })
        .eq("id", asset.id);
      return { ok: true as const, message: "View access granted on the source video." };
    }
    return {
      ok: false as const,
      message: result.state === "no_access" ? result.reason : "Access could not be granted.",
    };
  });

/* -------------------------------- helpers ------------------------------- */

type AssetRow = {
  id: string;
  label: string;
  provider: string;
  external_video_id: string | null;
};

/** Every film that sits behind the thing being shared. */
async function resolveShareAssets(
  supabase: unknown,
  resourceType: ShareResourceType,
  resourceId: string,
): Promise<AssetRow[]> {
  const client = supabase as {
    from: (table: string) => any;
  };

  if (resourceType === "game") {
    const { data } = await client
      .from("video_assets")
      .select("id, label, provider, external_video_id")
      .eq("game_id", resourceId);
    return (data ?? []) as AssetRow[];
  }

  const { data } = await client
    .from("playlist_clips")
    .select("clips(video_assets(id, label, provider, external_video_id))")
    .eq("playlist_id", resourceId);

  const rows = (data ?? []) as {
    clips: { video_assets: AssetRow | null } | null;
  }[];
  const unique = new Map<string, AssetRow>();
  for (const row of rows) {
    const asset = row.clips?.video_assets;
    if (asset) unique.set(asset.id, asset);
  }
  return [...unique.values()];
}
