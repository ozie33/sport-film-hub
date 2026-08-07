import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Every handler loads server-only modules lazily so this client-reachable
   module never pulls connector secrets into a browser bundle. */

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const request = getRequest();
    if (!request) throw new Error("The connection must start from an app request.");
    const returnUrl = new URL("/oauth/google-drive/return", request.url).toString();
    const { startDriveAuthorization } = await import("./drive.server");
    return startDriveAuthorization(context.userId, returnUrl);
  });

export const completeDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    if (!input?.code) throw new Error("Missing connection code");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { DRIVE_CONNECTOR_ID, GATEWAY_BASE_URL, cacheDriveAccountLabel } = await import(
      "./drive.server"
    );
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== DRIVE_CONNECTOR_ID) {
      throw new Error("The connection returned the wrong provider.");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    const account = await cacheDriveAccountLabel(context.userId, connectionAPIKey);
    await upsertProviderConnection(context.supabase, {
      status: "connected",
      externalAccountId: account.email,
      config: { display_name: account.displayName, email: account.email },
      connectedAt: new Date().toISOString(),
    });
    return { email: account.email };
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeDriveAuthorization } = await import("./drive.server");
    const { deleteConnectionForUser } = await import("@/server/appUserConnections.server");
    await revokeDriveAuthorization(context.userId);
    await deleteConnectionForUser(context.userId, "google_drive");
    await upsertProviderConnection(context.supabase, {
      status: "not_connected",
      externalAccountId: null,
      config: {},
      connectedAt: null,
    });
    return { ok: true };
  });

export const getDriveConnectionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionRowForUser } = await import("@/server/appUserConnections.server");
    const row = await getConnectionRowForUser(context.userId, "google_drive");
    const configured = Boolean(process.env["GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY"]);
    return {
      configured,
      connected: Boolean(row),
      email: row?.account_label ?? null,
      connectedAt: row?.created_at ?? null,
    };
  });

export const listDriveVideoFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; pageToken?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { listDriveVideos } = await import("./drive.server");
    try {
      return await listDriveVideos(context.userId, data);
    } catch (error) {
      throw new Error(friendlyDriveError(error));
    }
  });

export const getDriveFileDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!input?.fileId) throw new Error("Missing Drive file id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { getDriveFile } = await import("./drive.server");
    try {
      return await getDriveFile(context.userId, data.fileId);
    } catch (error) {
      throw new Error(friendlyDriveError(error));
    }
  });

export const createDriveUploadSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; mimeType: string; size: number }) => {
    if (!input?.name) throw new Error("Missing file name");
    if (!Number.isFinite(input.size) || input.size <= 0) throw new Error("Invalid file size");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { createDriveResumableSession } = await import("./drive.server");
    try {
      return await createDriveResumableSession(context.userId, data);
    } catch (error) {
      throw new Error(friendlyDriveError(error));
    }
  });

/**
 * Mints a short-lived, token-authorized stream URL for a Drive-backed asset.
 * Access is decided here, by the caller's own RLS view of the asset.
 */
export const getDrivePlaybackUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assetId: string }) => {
    if (!input?.assetId) throw new Error("Missing asset id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: asset, error } = await context.supabase
      .from("video_assets")
      .select("id, provider, external_video_id, created_by")
      .eq("id", data.assetId)
      .maybeSingle();
    if (error) throw error;
    if (!asset || asset.provider !== "google_drive" || !asset.external_video_id) {
      return { url: null as string | null, reason: "This film is not a Google Drive source." };
    }
    const { mintPlaybackToken } = await import("./playback-token.server");
    const token = mintPlaybackToken(asset.id, context.userId);
    return { url: `/api/public/drive-stream/${asset.id}?token=${token}`, reason: null };
  });

/* -------------------------------- helpers ------------------------------- */

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { maybeSingle: () => Promise<{ data: { id: string } | null }> };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<unknown>;
    };
    insert: (values: Record<string, unknown>) => Promise<unknown>;
  };
};

/** Keeps the user-visible connection row in step with the stored credential. */
async function upsertProviderConnection(
  supabase: unknown,
  input: {
    status: "connected" | "not_connected";
    externalAccountId: string | null;
    config: Record<string, unknown>;
    connectedAt: string | null;
  },
) {
  const client = supabase as SupabaseLike;
  const { data: existing } = await client
    .from("video_provider_connections")
    .select("id")
    .eq("provider", "google_drive")
    .maybeSingle();
  const values = {
    provider: "google_drive",
    status: input.status,
    external_account_id: input.externalAccountId,
    config: input.config,
    connected_at: input.connectedAt,
  };
  if (existing?.id) {
    await client.from("video_provider_connections").update(values).eq("id", existing.id);
    return;
  }
  await client.from("video_provider_connections").insert(values);
}

/** Provider errors become plain language before they reach a user. */
export function friendlyDriveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "DRIVE_NOT_CONNECTED") {
    return "Google Drive isn't connected for your account yet.";
  }
  if (message.startsWith("DRIVE_ERROR:401") || message.startsWith("DRIVE_ERROR:403")) {
    return "Google Drive refused that request. Reconnect your Drive account and try again.";
  }
  if (message.startsWith("DRIVE_ERROR:404")) {
    return "That file is no longer available in Google Drive.";
  }
  if (message.startsWith("DRIVE_ERROR")) {
    return "Google Drive could not complete that request. Try again in a moment.";
  }
  return message;
}
