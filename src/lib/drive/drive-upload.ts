/**
 * Browser-side resumable upload straight into the user's own Google Drive.
 *
 * The session URL is a one-time capability created by an authenticated server
 * function — no Google token is exposed, and the bytes never pass through (or
 * stay in) application storage.
 */

import { videoMimeType } from "@/lib/video/upload";
const CHUNK_SIZE = 8 * 1024 * 1024;

export type DriveUploadController = {
  promise: Promise<{ fileId: string }>;
  abort: () => void;
};

export function uploadFileToDrive(options: {
  file: File;
  sessionUrl: string;
  onProgress: (percent: number) => void;
}): DriveUploadController {
  let aborted = false;
  let active: XMLHttpRequest | null = null;

  const promise = (async () => {
    const total = options.file.size;
    let offset = 0;

    while (offset < total) {
      if (aborted) throw new Error("Upload cancelled");
      const end = Math.min(offset + CHUNK_SIZE, total);
      const chunk = options.file.slice(offset, end);
      const result = await putChunk({
        sessionUrl: options.sessionUrl,
        chunk,
        start: offset,
        end: end - 1,
        total,
        mimeType: videoMimeType(options.file),
        onProgress: (loaded) =>
          options.onProgress(Math.min(99, Math.round(((offset + loaded) / total) * 100))),
        register: (request) => {
          active = request;
        },
      });

      if (result.kind === "done") {
        options.onProgress(100);
        return { fileId: result.fileId };
      }
      offset = result.nextOffset;
    }
    throw new Error("Google Drive did not confirm the upload.");
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      active?.abort();
    },
  };
}

type ChunkResult = { kind: "done"; fileId: string } | { kind: "continue"; nextOffset: number };

function putChunk(options: {
  sessionUrl: string;
  chunk: Blob;
  start: number;
  end: number;
  total: number;
  mimeType: string;
  onProgress: (loaded: number) => void;
  register: (request: XMLHttpRequest) => void;
}): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    options.register(request);
    request.open("PUT", options.sessionUrl, true);
    request.setRequestHeader("Content-Type", options.mimeType);
    request.setRequestHeader(
      "Content-Range",
      `bytes ${options.start}-${options.end}/${options.total}`,
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(event.loaded);
    };
    request.onload = () => {
      // 308 = chunk accepted, keep going. 200/201 = upload complete.
      if (request.status === 308) {
        const range = request.getResponseHeader("Range");
        const nextOffset = range ? Number(range.split("-")[1]) + 1 : options.end + 1;
        resolve({ kind: "continue", nextOffset });
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        try {
          const body = JSON.parse(request.responseText) as { id?: string };
          if (body.id) {
            resolve({ kind: "done", fileId: body.id });
            return;
          }
        } catch {
          // fall through to the error below
        }
        reject(new Error("Google Drive finished the upload without returning a file id."));
        return;
      }
      reject(new Error(driveUploadError(request.status)));
    };
    request.onerror = () =>
      reject(
        new Error(
          "The browser could not reach Google Drive to upload. Check your connection, or store this film in application storage instead.",
        ),
      );
    request.onabort = () => reject(new Error("Upload cancelled"));
    request.send(options.chunk);
  });
}

function driveUploadError(status: number): string {
  if (status === 401 || status === 403) {
    return "Google Drive refused the upload. Reconnect your Drive account and try again.";
  }
  if (status === 404) return "The upload session expired. Start the upload again.";
  return `Google Drive upload failed (${status}).`;
}
