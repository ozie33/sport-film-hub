import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewedPlaysLabel } from "@/lib/ai/review-ai";
import { useGeneratePlaylist } from "@/lib/data/ai-queries";
import { PRODUCT_EVENTS } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/track";

const EXAMPLES = [
  "Show me every play where he attacked the rim",
  "Every defensive mistake",
  "All catch-and-shoot jumpers",
  "Turnovers under pressure",
];

/** Natural-language playlist generation over already-marked plays. */
export function AiPlaylistPrompt({
  gameId,
  playerId,
  onCreated,
}: {
  gameId?: string | null;
  playerId?: string | null;
  onCreated?: (playlistId: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const generate = useGeneratePlaylist();

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    generate.mutate(
      { prompt: trimmed, gameId: gameId ?? null, playerId: playerId ?? null },
      {
        onSuccess: (result) => {
          trackEvent(PRODUCT_EVENTS.aiPlaylistCreated, {
            gameId: gameId ?? null,
            playerId: playerId ?? null,
            properties: { source: "prompt", clip_count: result.clipCount },
          });
          toast.success(
            `AI organized ${reviewedPlaysLabel(result.reviewedClipCount)} into "${result.name}" (${result.clipCount} clips)`,
          );
          setPrompt("");
          onCreated?.(result.id);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <SectionCard
      title="AI Playlist Generator"
      description="Describe a playlist and the AI picks from the plays you marked"
    >
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          submit(prompt);
        }}
      >
        <Input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Show me every play where he attacked the rim"
          aria-label="Describe the playlist you want"
        />
        <Button type="submit" disabled={generate.isPending || prompt.trim().length === 0}>
          <Sparkles className="size-4" />
          {generate.isPending ? "Building…" : "Build playlist"}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <Button
            key={example}
            type="button"
            size="sm"
            variant="outline"
            disabled={generate.isPending}
            onClick={() => submit(example)}
          >
            {example}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}