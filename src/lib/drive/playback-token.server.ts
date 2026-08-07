/**
 * Short-lived signed playback tokens.
 *
 * A <video> element cannot send an Authorization header, so the streaming
 * route is authorized by an HMAC token minted by an authenticated server
 * function. The token names the asset, the viewer and an expiry — it is not
 * a Google credential and grants nothing else.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 60 * 60 * 6;

function secret(): string {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  return raw;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function mintPlaybackToken(assetId: string, viewerId: string): string {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${assetId}.${viewerId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export type PlaybackTokenClaims = { assetId: string; viewerId: string };

export function verifyPlaybackToken(token: string, assetId: string): PlaybackTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [tokenAssetId, viewerId, expires, signature] = parts as [string, string, string, string];
  if (tokenAssetId !== assetId) return null;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  const expected = sign(`${tokenAssetId}.${viewerId}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { assetId: tokenAssetId, viewerId };
}
