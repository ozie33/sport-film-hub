import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, HardDrive, Loader2, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFileSize } from "@/lib/video/upload";
import { listDriveVideoFiles } from "@/lib/drive/drive.functions";
import { cn } from "@/lib/utils";

export type DriveFile = {
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

/** Browses the signed-in user's own Drive videos. Nothing is copied here. */
export function DriveFilePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (file: DriveFile) => void;
}) {
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");

  const listing = useQuery({
    queryKey: ["drive-files", search],
    queryFn: async () => listDriveVideoFiles({ data: search ? { search } : {} }),
  });

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          setSearch(term.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(inputEvent) => setTerm(inputEvent.target.value)}
            placeholder="Search your Drive videos"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Refresh Drive list"
          onClick={() => listing.refetch()}
        >
          <RefreshCw className={cn("size-4", listing.isFetching && "animate-spin")} />
        </Button>
      </form>

      {listing.isPending ? (
        <div className="grid place-items-center rounded-xl border border-border bg-card p-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : listing.isError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive">
          {listing.error instanceof Error ? listing.error.message : "Could not read your Drive."}
        </p>
      ) : (listing.data?.files.length ?? 0) === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          No MP4, MOV or M4V videos found in your Drive. Upload film to Drive, or search a
          different name.
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {listing.data!.files.map((file) => {
            const selected = file.id === selectedId;
            return (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => onSelect(file)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
                    {file.thumbnailLink ? (
                      <img
                        src={file.thumbnailLink}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <HardDrive className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                      {file.durationMillis
                        ? ` · ${Math.round(file.durationMillis / 60000)} min`
                        : ""}
                      {file.ownedByMe ? "" : " · shared with you"}
                    </span>
                  </span>
                  {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function useDriveSelection() {
  return useMutation({ mutationFn: async (file: DriveFile) => file });
}
