import { supabase } from "@/integrations/supabase/client";
import { FILM_BUCKET } from "@/lib/data/video-queries";
import { ACCEPTED_UPLOAD_EXTENSIONS, ACCEPTED_UPLOAD_MIME } from "@/lib/video/capabilities";

export type VideoProbe = {
  duration: number | null;
  width: number | null;
  height: number | null;
};

/** Reads duration/dimensions locally so we don't have to claim a transcode ran. */
export function probeVideoFile(file: File): Promise<VideoProbe> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ duration: null, width: null, height: null });
      return;
    }
    const url = URL.createObjectURL(file);
    const element = document.createElement("video");
    const finish = (probe: VideoProbe) => {
      URL.revokeObjectURL(url);
      resolve(probe);
    };
    element.preload = "metadata";
    element.onloadedmetadata = () =>
      finish({
        duration: Number.isFinite(element.duration) ? Math.round(element.duration) : null,
        width: element.videoWidth || null,
        height: element.videoHeight || null,
      });
    element.onerror = () => finish({ duration: null, width: null, height: null });
    element.src = url;
  });
}

export function isAcceptedVideoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_UPLOAD_MIME.includes(file.type) ||
    ACCEPTED_UPLOAD_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export type UploadController = {
  promise: Promise<void>;
  abort: () => void;
};

/**
 * Uploads to private storage over XHR so we get real progress plus cancel.
 * The file itself never touches a database row — only its storage path does.
 */
export function uploadFilmFile(options: {
  file: File;
  path: string;
  onProgress: (percent: number) => void;
}): UploadController {
  const request = new XMLHttpRequest();
  const promise = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Your session expired. Sign in again to upload film.");

    const baseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
    const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
    const endpoint = `${baseUrl}/storage/v1/object/${FILM_BUCKET}/${options.path}`;

    await new Promise<void>((resolve, reject) => {
      request.open("POST", endpoint, true);
      request.setRequestHeader("authorization", `Bearer ${accessToken}`);
      request.setRequestHeader("apikey", apiKey);
      request.setRequestHeader("x-upsert", "true");
      request.setRequestHeader("cache-control", "3600");
      if (options.file.type) request.setRequestHeader("content-type", options.file.type);
      request.upload.onprogress = (progressEvent) => {
        if (!progressEvent.lengthComputable) return;
        options.onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          options.onProgress(100);
          resolve();
          return;
        }
        reject(new Error(uploadErrorMessage(request.status, request.responseText)));
      };
      request.onerror = () => reject(new Error("Network error while uploading. Check your connection and retry."));
      request.onabort = () => reject(new Error("Upload cancelled"));
      request.send(options.file);
    });
  })();

  return { promise, abort: () => request.abort() };
}

function uploadErrorMessage(status: number, body: string): string {
  if (status === 413) return "That file is larger than the storage limit for a single upload.";
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || `Upload failed (${status})`;
  } catch {
    return `Upload failed (${status})`;
  }
}

export function buildFilmStoragePath(userId: string, gameId: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return `${userId}/${gameId}/${Date.now()}-${safeName}`;
}