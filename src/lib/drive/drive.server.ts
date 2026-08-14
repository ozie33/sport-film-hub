/**
 * Google Drive provider — server-only.
 *
 * Every call goes through the Lovable connector gateway with the signed-in
 * user's own Drive authorization. No Google token ever reaches the browser,
 * and no Drive file is copied into application storage.
 */
import {
  authorizeAppUserOAuth,
  callAsAppUser,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";
import {
  getConnectionKeyForUser,
  setAccountLabel,
} from "@/server/appUserConnections.server";

export const DRIVE_CONNECTOR_ID = "google_drive";
export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

/** Only what this product needs: identity + read/write of user-selected film. */
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];

export const DRIVE_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
];

function clientApiKey(): string {
  const key = process.env["GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY"];
  if (!key) {
    throw new Error(
      "Google Drive is not configured for this project yet. Connect the Google Drive app-user connector first.",
    );
  }
  return key;
}

export async function startDriveAuthorization(userId: string, returnUrl: string) {
  const existing = await getConnectionKeyForUser(userId, DRIVE_CONNECTOR_ID);
  const { authorizationUrl } = await authorizeAppUserOAuth({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectorId: DRIVE_CONNECTOR_ID,
    appUserId: userId,
    clientAPIKey: clientApiKey(),
    returnUrl,
    ...(existing ? { connectionAPIKey: existing } : {}),
    credentialsConfiguration: { scopes: DRIVE_SCOPES },
  });
  return { authorizationUrl };
}

export async function revokeDriveAuthorization(userId: string) {
  const connectionAPIKey = await getConnectionKeyForUser(userId, DRIVE_CONNECTOR_ID);
  if (!connectionAPIKey) return;
  try {
    await disconnectAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: DRIVE_CONNECTOR_ID,
    });
  } catch (error) {
    // The local record is removed either way — a stale gateway connection
    // must not block the user from disconnecting in the app.
    console.error("Drive gateway disconnect failed", error);
  }
}

async function requireKey(userId: string): Promise<string> {
  const connectionAPIKey = await getConnectionKeyForUser(userId, DRIVE_CONNECTOR_ID);
  if (!connectionAPIKey) throw new Error("DRIVE_NOT_CONNECTED");
  return connectionAPIKey;
}

async function driveFetch(
  userId: string,
  path: string,
  init?: RequestInit,
  keyOverride?: string,
): Promise<Response> {
  const connectionAPIKey = keyOverride ?? (await requireKey(userId));
  return callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: DRIVE_CONNECTOR_ID,
    path,
    ...(init ? { init } : {}),
  });
}

/** Surfaces the provider's own message instead of a generic failure. */
async function driveJson<T>(res: Response, action: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`Drive ${action} failed [${res.status}]: ${text}`);
    throw new Error(`DRIVE_ERROR:${res.status}:${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function fetchDriveAccount(userId: string, keyOverride?: string) {
  const res = await driveFetch(
    userId,
    "/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota(limit,usage)",
    undefined,
    keyOverride,
  );
  const body = await driveJson<{
    user?: { displayName?: string; emailAddress?: string; photoLink?: string };
  }>(res, "about");
  return {
    displayName: body.user?.displayName ?? null,
    email: body.user?.emailAddress ?? null,
    photo: body.user?.photoLink ?? null,
  };
}

/** Called right after consent so Settings can show which account is linked. */
export async function cacheDriveAccountLabel(userId: string, connectionAPIKey: string) {
  try {
    const account = await fetchDriveAccount(userId, connectionAPIKey);
    if (account.email) await setAccountLabel(userId, DRIVE_CONNECTOR_ID, account.email);
    return account;
  } catch (error) {
    console.error("Drive account lookup failed", error);
    return { displayName: null, email: null, photo: null };
  }
}

export type DriveFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  durationMillis: number | null;
  width: number | null;
  height: number | null;
  thumbnailLink: string | null;
  webViewLink: string | null;
  modifiedTime: string | null;
  ownedByMe: boolean;
  canShare: boolean;
};

const FILE_FIELDS =
  "id,name,mimeType,size,thumbnailLink,webViewLink,modifiedTime,ownedByMe,capabilities(canShare),videoMediaMetadata(durationMillis,width,height)";

type RawDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  ownedByMe?: boolean;
  capabilities?: { canShare?: boolean };
  videoMediaMetadata?: { durationMillis?: string; width?: number; height?: number };
};

function mapFile(file: RawDriveFile): DriveFileSummary {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : null,
    durationMillis: file.videoMediaMetadata?.durationMillis
      ? Number(file.videoMediaMetadata.durationMillis)
      : null,
    width: file.videoMediaMetadata?.width ?? null,
    height: file.videoMediaMetadata?.height ?? null,
    thumbnailLink: file.thumbnailLink ?? null,
    webViewLink: file.webViewLink ?? null,
    modifiedTime: file.modifiedTime ?? null,
    ownedByMe: file.ownedByMe ?? false,
    canShare: file.capabilities?.canShare ?? false,
  };
}

export async function listDriveVideos(
  userId: string,
  options: { search?: string; pageToken?: string },
) {
  const clauses = [
    "trashed = false",
    `(${DRIVE_VIDEO_MIME_TYPES.map((mime) => `mimeType = '${mime}'`).join(" or ")})`,
  ];
  if (options.search?.trim()) {
    const safe = options.search.trim().replace(/['\\]/g, "");
    clauses.push(`name contains '${safe}'`);
  }
  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    orderBy: "modifiedTime desc",
    pageSize: "50",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const res = await driveFetch(userId, `/drive/v3/files?${params.toString()}`);
  const body = await driveJson<{ files?: RawDriveFile[]; nextPageToken?: string }>(res, "list files");
  return {
    files: (body.files ?? []).map(mapFile),
    nextPageToken: body.nextPageToken ?? null,
  };
}

export async function getDriveFile(userId: string, fileId: string): Promise<DriveFileSummary> {
  const params = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: "true" });
  const res = await driveFetch(userId, `/drive/v3/files/${fileId}?${params.toString()}`);
  return mapFile(await driveJson<RawDriveFile>(res, "get file"));
}

/**
 * Opens a resumable Drive upload session. The browser streams bytes straight
 * to the returned Google session URL, so the file never passes through — or
 * lands in — application storage.
 */
export async function createDriveResumableSession(
  userId: string,
  input: { name: string; mimeType: string; size: number },
) {
  const params = new URLSearchParams({ uploadType: "resumable", supportsAllDrives: "true" });
  const res = await driveFetch(userId, `/upload/drive/v3/files?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType || "video/mp4",
      "X-Upload-Content-Length": String(input.size),
    },
    body: JSON.stringify({ name: input.name, mimeType: input.mimeType || "video/mp4" }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Drive resumable session failed [${res.status}]: ${text}`);
    throw new Error(`DRIVE_ERROR:${res.status}:${text.slice(0, 400)}`);
  }
  const sessionUrl = res.headers.get("location") ?? res.headers.get("Location");
  if (!sessionUrl) throw new Error("Google Drive did not return an upload session URL.");
  return { sessionUrl };
}

/** Raw authorized stream for playback and for Phase 3 analysis retrieval. */
export async function streamDriveFile(
  userId: string,
  fileId: string,
  range: string | null,
): Promise<Response> {
  const init: RequestInit = range ? { headers: { Range: range } } : {};
  return driveFetch(
    userId,
    `/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    init,
  );
}

/* ----------------------------- permissions ----------------------------- */

export type DriveAccessCheck =
  | { state: "no_connection" }
  | { state: "accessible"; canShare: boolean }
  | { state: "granted"; canShare: boolean }
  | { state: "no_access"; canShare: boolean; reason: string };

/** Does the file already list this email as a reader/writer/owner? */
export async function checkDriveViewerAccess(
  ownerUserId: string,
  fileId: string,
  email: string,
): Promise<DriveAccessCheck> {
  let file: DriveFileSummary;
  try {
    file = await getDriveFile(ownerUserId, fileId);
  } catch (error) {
    if (error instanceof Error && error.message === "DRIVE_NOT_CONNECTED") {
      return { state: "no_connection" };
    }
    throw error;
  }

  const params = new URLSearchParams({
    fields: "permissions(id,emailAddress,type,role,domain)",
    supportsAllDrives: "true",
  });
  const res = await driveFetch(ownerUserId, `/drive/v3/files/${fileId}/permissions?${params}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`Drive permission list failed [${res.status}]: ${text}`);
    return {
      state: "no_access",
      canShare: file.canShare,
      reason: "We could not read this file's sharing settings.",
    };
  }
  const body = (await res.json()) as {
    permissions?: { emailAddress?: string; type?: string; role?: string }[];
  };
  const target = email.trim().toLowerCase();
  const hasAccess = (body.permissions ?? []).some((permission) => {
    if (permission.type === "anyone") return true;
    return (permission.emailAddress ?? "").toLowerCase() === target;
  });
  return hasAccess
    ? { state: "accessible", canShare: file.canShare }
    : {
        state: "no_access",
        canShare: file.canShare,
        reason: "This person is not on the source video's sharing list yet.",
      };
}

/** Adds the recipient as a viewer, using the coach's own Drive authorization. */
export async function grantDriveViewerAccess(
  ownerUserId: string,
  fileId: string,
  email: string,
): Promise<DriveAccessCheck> {
  const params = new URLSearchParams({
    sendNotificationEmail: "false",
    supportsAllDrives: "true",
    fields: "id",
  });
  const res = await driveFetch(ownerUserId, `/drive/v3/files/${fileId}/permissions?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "user", emailAddress: email }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Drive permission create failed [${res.status}]: ${text}`);
    return {
      state: "no_access",
      canShare: false,
      reason:
        res.status === 403
          ? "Your Google account isn't allowed to share this file."
          : "Google Drive refused to add this viewer.",
    };
  }
  return { state: "granted", canShare: true };
}
