import { createFileRoute } from "@tanstack/react-router";

/**
 * Range-aware proxy for Google Drive film.
 *
 * Authorization is the signed token minted by `getDrivePlaybackUrl`, which
 * only issues one after the caller's own row-level access to the asset is
 * confirmed. The Drive credential stays server-side, and nothing is cached
 * or copied into application storage.
 */
export const Route = createFileRoute("/api/public/drive-stream/$assetId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleStream(request, params.assetId),
      HEAD: async ({ request, params }) => handleStream(request, params.assetId),
    },
  },
});

async function handleStream(request: Request, assetId: string): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 401 });

  const { verifyPlaybackToken } = await import("@/lib/drive/playback-token.server");
  const claims = verifyPlaybackToken(token, assetId);
  if (!claims) return new Response("Link expired", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: asset, error } = await supabaseAdmin
    .from("video_assets")
    .select("id, provider, external_video_id, created_by, mime_type")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !asset || asset.provider !== "google_drive" || !asset.external_video_id) {
    return new Response("Film not found", { status: 404 });
  }
  if (!asset.created_by) return new Response("Film has no connected owner", { status: 409 });

  const { streamDriveFile } = await import("@/lib/drive/drive.server");
  let upstream: Response;
  try {
    upstream = await streamDriveFile(
      asset.created_by,
      asset.external_video_id,
      request.headers.get("range"),
    );
  } catch (streamError) {
    console.error("Drive stream failed", streamError);
    return new Response("Source video is unavailable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    const body = await upstream.text();
    console.error(`Drive stream rejected [${upstream.status}]: ${body}`);
    return new Response("Source video is unavailable", { status: 502 });
  }

  const headers = new Headers();
  for (const header of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", asset.mime_type ?? "video/mp4");
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=0, no-store");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
