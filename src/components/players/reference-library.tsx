import { useRef, useState } from "react";
import { ExternalLink, Images, Link2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { ReferenceThumb } from "@/components/players/reference-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  REFERENCE_BUCKET,
  buildReferenceStoragePath,
  useCreateLink,
  useCreateReference,
  useDeleteLink,
  useDeleteReference,
  usePlayerLinks,
  usePlayerReferences,
  type ReferenceMediaRecord,
} from "@/lib/data/identity-queries";
import {
  EXTERNAL_LINK_LABELS,
  EXTERNAL_LINK_PROVIDERS,
  REFERENCE_TYPE_LABELS,
  UPLOADABLE_REFERENCE_TYPES,
  type ExternalLinkProvider,
  type PlayerReferenceType,
} from "@/lib/identity/identity";

export function ReferenceLibrary({ playerId }: { playerId: string }) {
  const { data: references = [], isLoading } = usePlayerReferences(playerId);
  const { data: links = [] } = usePlayerLinks(playerId);
  const createReference = useCreateReference();
  const deleteReference = useDeleteReference(playerId);
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink(playerId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referenceType, setReferenceType] = useState<PlayerReferenceType>("headshot");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [linkProvider, setLinkProvider] = useState<ExternalLinkProvider>("instagram");
  const [linkUrl, setLinkUrl] = useState("");

  const gameCrops = references.filter((reference) => reference.reference_type === "game_crop");
  const userReferences = references.filter((reference) => reference.reference_type !== "game_crop");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("Please sign in again");
      return;
    }
    setUploading(true);
    setProgress(0);
    const total = files.length;
    try {
      for (let index = 0; index < total; index += 1) {
        const file = files[index]!;
        const path = buildReferenceStoragePath(auth.user.id, playerId, file.name);
        const { error } = await supabase.storage.from(REFERENCE_BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) throw error;
        await createReference.mutateAsync({
          player_id: playerId,
          reference_type: file.type.startsWith("video/") ? "reference_video" : referenceType,
          provider: "upload",
          file_reference: path,
          mime_type: file.type || null,
          notes: notes.trim() || null,
        });
        setProgress(Math.round(((index + 1) / total) * 100));
      }
      toast.success(total > 1 ? `${total} references added` : "Reference added");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(reference: ReferenceMediaRecord) {
    try {
      await deleteReference.mutateAsync(reference);
      toast.success("Reference removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the reference");
    }
  }

  async function handleAddLink(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const trimmed = linkUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Enter a full URL starting with https://");
      return;
    }
    try {
      await createLink.mutateAsync({
        player_id: playerId,
        provider: linkProvider,
        url: trimmed,
        label: null,
      });
      setLinkUrl("");
      toast.success("Link added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the link");
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Player Reference Library"
        description="Reference media improves future automated player identification. Nothing is analyzed yet."
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Reference type</Label>
            <Select
              value={referenceType}
              onValueChange={(value) => setReferenceType(value as PlayerReferenceType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPLOADABLE_REFERENCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {REFERENCE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference-notes">Notes</Label>
            <Input
              id="reference-notes"
              placeholder="Optional context"
              value={notes}
              onChange={(inputEvent) => setNotes(inputEvent.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 size-4" /> {uploading ? "Uploading…" : "Upload files"}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/quicktime,video/x-m4v"
          className="hidden"
          onChange={(inputEvent) => void handleFiles(inputEvent.target.files)}
        />
        {uploading ? <Progress value={progress} className="mt-4 h-2" /> : null}

        <div className="mt-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading references…</p>
          ) : userReferences.length === 0 ? (
            <EmptyState
              icon={<Images className="size-8" />}
              title="No references yet"
              description="Add headshots, full body photos, practice photos and short reference videos."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {userReferences.map((reference) => (
                <ReferenceThumb
                  key={reference.id}
                  reference={reference}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Game Crops"
        description="Confirmed player crops will be saved here automatically during future AI review."
      >
        {gameCrops.length === 0 ? (
          <EmptyState
            title="No game crops yet"
            description="Game crops are generated later, once analysis is available."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gameCrops.map((reference) => (
              <ReferenceThumb key={reference.id} reference={reference} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="External reference links"
        description="Human references only — nothing is scraped or downloaded."
      >
        <form onSubmit={handleAddLink} className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select
              value={linkProvider}
              onValueChange={(value) => setLinkProvider(value as ExternalLinkProvider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTERNAL_LINK_PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {EXTERNAL_LINK_LABELS[provider]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference-link">Profile URL</Label>
            <Input
              id="reference-link"
              placeholder="https://instagram.com/athlete"
              value={linkUrl}
              onChange={(inputEvent) => setLinkUrl(inputEvent.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={createLink.isPending}>
            <Link2 className="mr-1 size-4" /> Add link
          </Button>
        </form>

        {links.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No external links yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Tag>{EXTERNAL_LINK_LABELS[link.provider] ?? link.provider}</Tag>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm text-primary hover:underline"
                  >
                    {link.url}
                    <ExternalLink className="ml-1 inline size-3" />
                  </a>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove link"
                  onClick={() => void deleteLink.mutateAsync(link.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}