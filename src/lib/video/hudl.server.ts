/**
 * Server-only Hudl provider adapter.
 *
 * Deliberately conservative: Hudl film is access-controlled, so until an
 * authorized integration exists we only validate and store the link the user
 * gives us. There is NO scraping, NO credential capture and NO assumption
 * that a Hudl URL exposes a downloadable video file.
 *
 * The functions below are the real integration seams. They report honest
 * "not configured" states rather than pretending an API exists.
 */

export type HudlAccessLevel =
  | "link_only"
  | "embed_available"
  | "authorized_api"
  | "raw_video_available"
  | "unsupported";

export type HudlConnectionState = {
  status: "not_connected" | "connected" | "needs_configuration";
  hasCredentials: boolean;
  /** Human readable explanation surfaced in the UI. */
  detail: string;
};

export function hudlCredentialState(): HudlConnectionState {
  const clientId = process.env["HUDL_CLIENT_ID"];
  const clientSecret = process.env["HUDL_CLIENT_SECRET"];
  if (clientId && clientSecret) {
    return {
      status: "needs_configuration",
      hasCredentials: true,
      detail:
        "Hudl API credentials are present. Authorization for your organization still needs to be completed.",
    };
  }
  return {
    status: "not_connected",
    hasCredentials: false,
    detail:
      "No Hudl integration is configured yet. Hudl links are stored as references and opened in Hudl.",
  };
}

/** What the adapter can currently do with a Hudl URL. */
export function resolveHudlAccessLevel(): { accessLevel: HudlAccessLevel; detail: string } {
  const state = hudlCredentialState();
  if (!state.hasCredentials) {
    return {
      accessLevel: "link_only",
      detail:
        "Stored as an authorized film reference. Playback happens in Hudl until an integration is connected.",
    };
  }
  return {
    accessLevel: "link_only",
    detail:
      "Credentials detected but organization authorization is incomplete, so only the film link is stored.",
  };
}

/* ----------------------- future integration seams ----------------------- */

export type HudlNotConfigured = { configured: false; reason: string };

function notConfigured(feature: string): HudlNotConfigured {
  return {
    configured: false,
    reason: `${feature} requires an authorized Hudl integration, which is not connected for this workspace.`,
  };
}

export function hudlAuthorizationUrl(): HudlNotConfigured {
  return notConfigured("Hudl authorization");
}

export function lookupHudlOrganization(): HudlNotConfigured {
  return notConfigured("Hudl organization lookup");
}

export function lookupHudlTeam(): HudlNotConfigured {
  return notConfigured("Hudl team lookup");
}

export function lookupHudlGame(): HudlNotConfigured {
  return notConfigured("Hudl game lookup");
}

export function lookupHudlVideo(): HudlNotConfigured {
  return notConfigured("Hudl video lookup");
}

export function requestHudlAuthorizedMedia(): HudlNotConfigured {
  return notConfigured("Authorized Hudl media access");
}