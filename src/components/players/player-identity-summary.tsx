import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { ReferenceThumb } from "@/components/players/reference-thumb";
import {
  currentMembership,
  teamDisplayName,
  usePlayerMemberships,
  usePlayerReferences,
} from "@/lib/data/identity-queries";
import { computeIdentityScore, IDENTITY_TIER_LABELS } from "@/lib/identity/identity";
import { fullName } from "@/lib/format";

/**
 * Read-only identity snapshot shown inside a game. Future AI review will read
 * exactly these signals to identify the athlete on film.
 */
export function PlayerIdentitySummary({
  playerId,
  playerName,
  gameContext,
}: {
  playerId: string;
  playerName?: { first: string; last: string };
  gameContext?: {
    teamName?: string | null;
    jerseyNumber?: string | null;
    positionName?: string | null;
    season?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  };
}) {
  const { data: memberships = [] } = usePlayerMemberships(playerId);
  const { data: references = [] } = usePlayerReferences(playerId);

  const membership = currentMembership(memberships);
  const photos = references.filter(
    (reference) =>
      reference.reference_type !== "reference_video" && reference.reference_type !== "game_crop",
  );
  const videos = references.filter((reference) => reference.reference_type === "reference_video");
  const crops = references.filter((reference) => reference.reference_type === "game_crop");

  const teamName = gameContext?.teamName ?? teamDisplayName(membership?.teams);
  const jersey = gameContext?.jerseyNumber ?? membership?.jersey_number ?? null;
  const position = gameContext?.positionName ?? membership?.position_label ?? null;
  const season = gameContext?.season ?? membership?.season ?? null;

  const score = computeIdentityScore({
    photoCount: photos.length,
    videoCount: videos.length,
    gameCropCount: crops.length,
    hasCurrentTeam: Boolean(membership),
    hasJerseyNumber: Boolean(jersey),
    hasPosition: Boolean(position),
  });

  return (
    <SectionCard
      title="Player Identity Summary"
      description="Team, number and reference media that future analysis will use."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/players/$playerId" params={{ playerId }}>
            Open profile
          </Link>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Shield className="size-4 text-primary" />
        <span className="text-sm font-semibold uppercase">
          {playerName ? fullName(playerName.first, playerName.last) : "Primary player"}
        </span>
        <Tag>Identity: {IDENTITY_TIER_LABELS[score.tier]}</Tag>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tag>{teamName}</Tag>
        {jersey ? <Tag>#{jersey}</Tag> : <Tag>No jersey number</Tag>}
        {position ? <Tag>{position}</Tag> : <Tag>No position</Tag>}
        {season ? <Tag>{season}</Tag> : null}
        {gameContext?.primaryColor ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
            Uniform
            <span
              className="size-3 rounded-full border border-border"
              style={{ backgroundColor: gameContext.primaryColor }}
            />
            {gameContext.secondaryColor ? (
              <span
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: gameContext.secondaryColor }}
              />
            ) : null}
          </span>
        ) : null}
      </div>

      {references.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No reference media yet — add photos and short clips from the player profile.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {references.slice(0, 4).map((reference) => (
            <ReferenceThumb key={reference.id} reference={reference} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}