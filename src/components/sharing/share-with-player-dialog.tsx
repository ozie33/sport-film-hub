import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Share2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SourceBadge } from "@/components/video/source-badge";
import {
  useCreateShare,
  useRevokeShare,
  useSharesByMe,
  type SharePermission,
} from "@/lib/data/share-queries";
import {
  checkShareSourceAccess,
  findAppUserByEmail,
  grantShareSourceAccess,
  type ShareResourceType,
} from "@/lib/sharing/sharing.functions";
import { fullName } from "@/lib/format";
import { PRODUCT_EVENTS } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

type SourceCheck = Awaited<ReturnType<typeof checkShareSourceAccess>>["sources"][number];
type Recipient = Awaited<ReturnType<typeof findAppUserByEmail>>;

/**
 * App-level sharing and source-video access are separate things, so this
 * dialog reports both and only claims access it actually granted.
 */
export function ShareWithPlayerDialog({
  resourceType,
  resourceId,
  resourceName,
  trigger,
}: {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [permission, setPermission] = useState<SharePermission>("view");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [sources, setSources] = useState<SourceCheck[] | null>(null);

  const existing = useSharesByMe(resourceId);
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();

  const lookup = useMutation({
    mutationFn: async () => {
      const found = await findAppUserByEmail({ data: { email } });
      const access = await checkShareSourceAccess({
        data: { resourceType, resourceId, email: email.trim().toLowerCase() },
      });
      return { found, access };
    },
    onSuccess: (result) => {
      setRecipient(result.found);
      setSources(result.access.sources);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not look up that person"),
  });

  const grant = useMutation({
    mutationFn: async (assetId: string) =>
      grantShareSourceAccess({ data: { assetId, email: email.trim().toLowerCase() } }),
    onSuccess: (result, assetId) => {
      if (result.ok) {
        setSources(
          (current) =>
            current?.map((source) =>
              source.assetId === assetId
                ? { ...source, state: "ok", message: result.message }
                : source,
            ) ?? null,
        );
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not grant source access"),
  });

  function reset() {
    setEmail("");
    setNote("");
    setRecipient(null);
    setSources(null);
  }

  async function handleShare() {
    const normalized = email.trim().toLowerCase();
    try {
      await createShare.mutateAsync({
        resource_type: resourceType,
        resource_id: resourceId,
        shared_with_user_id: recipient?.found ? recipient.userId : null,
        shared_with_email: normalized,
        permission,
        note: note.trim() || null,
        source_access_state: sourceState(sources),
      });
      if (resourceType === "reel") {
        trackEvent(PRODUCT_EVENTS.reelShared, {
          reelId: resourceId,
          properties: { recipient_has_account: Boolean(recipient?.found), permission },
        });
      }
      toast.success(
        recipient?.found
          ? "Shared. It now appears in their Shared with me."
          : "Saved. They'll see it as soon as they create an account with that email.",
      );
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not share");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Share2 className="size-4" />
            Share with player
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{resourceName}”</DialogTitle>
          <DialogDescription>
            They get read-only access in their own Film Room. Source video access is checked
            separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="share-email">Player or parent email</Label>
            <div className="flex gap-2">
              <Input
                id="share-email"
                type="email"
                value={email}
                onChange={(inputEvent) => {
                  setEmail(inputEvent.target.value);
                  setRecipient(null);
                  setSources(null);
                }}
                placeholder="player@example.com"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!email.trim() || lookup.isPending}
                onClick={() => lookup.mutate()}
              >
                {lookup.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Check
              </Button>
            </div>
          </div>

          {recipient ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {recipient.found
                ? `Found ${fullName(recipient.firstName, recipient.lastName) || recipient.email}${
                    recipient.role ? ` · ${recipient.role}` : ""
                  }.`
                : "No account with that email yet — the share waits for them to sign up."}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label>Permission</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["view", "comment"] as SharePermission[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPermission(option)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left text-sm capitalize transition-colors",
                    permission === option
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {sources ? <SourceAccessList sources={sources} grant={grant} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="share-note">Note (optional)</Label>
            <Textarea
              id="share-note"
              value={note}
              onChange={(textEvent) => setNote(textEvent.target.value)}
              placeholder="Watch your closeouts in the third quarter."
              rows={2}
            />
          </div>

          {existing.data && existing.data.length > 0 ? (
            <div className="space-y-2">
              <Label>Already shared with</Label>
              <ul className="space-y-1.5">
                {existing.data.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      {share.shared_with_email ?? "Player"} · {share.permission}
                      {share.viewed_at ? " · viewed" : " · not opened yet"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove share"
                      onClick={() => revokeShare.mutate(share.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleShare}
            disabled={!email.trim() || createShare.isPending}
          >
            {createShare.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceAccessList({
  sources,
  grant,
}: {
  sources: SourceCheck[];
  grant: ReturnType<typeof useMutation<{ ok: boolean; message: string }, Error, string>>;
}) {
  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        No film is attached yet, so there&apos;s no source video to check.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Label>Source video access</Label>
      <ul className="space-y-2">
        {sources.map((source) => (
          <li key={source.assetId} className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge provider={source.provider} />
              <span className="truncate text-xs font-medium">{source.label}</span>
              {source.state === "ok" ? (
                <Check className="size-3.5 text-primary" />
              ) : (
                <AlertTriangle className="size-3.5 text-amber-400" />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{source.message}</p>
            {source.state === "needs_grant" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={grant.isPending}
                onClick={() => grant.mutate(source.assetId)}
              >
                {grant.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Grant view access
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function sourceState(sources: SourceCheck[] | null): string {
  if (!sources || sources.length === 0) return "not_applicable";
  if (sources.every((source) => source.state === "ok")) return "ok";
  if (sources.some((source) => source.state === "provider_managed")) return "provider_managed";
  return "needs_attention";
}
