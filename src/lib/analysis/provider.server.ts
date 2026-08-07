/**
 * External analysis-service adapter.
 *
 * The application never talks to a computer-vision model directly. It submits a
 * job to whatever provider is configured and reads back a structured result. A
 * future Python/GPU service only has to implement this HTTP contract — no
 * frontend or database redesign required.
 */

import {
  CANDIDATE_REASONS,
  CONFIRMATION_THRESHOLD,
  DEFAULT_POST_ROLL,
  DEFAULT_PRE_ROLL,
  type AnalysisJobStatus,
  type CandidateReason,
} from "@/lib/analysis/analysis";

export type AnalysisSubmitRequest = {
  jobId: string;
  gameId: string;
  videoAssetId: string;
  playerId: string;
  sportId: string | null;
  analysisType: string;
  /** Everything the tracker needs about *this* game's identity context. */
  identityContext: {
    team: string | null;
    jerseyNumber: string | null;
    position: string | null;
    season: string | null;
    uniformPrimaryColor: string | null;
    uniformSecondaryColor: string | null;
    referencePhotoCount: number;
    referenceVideoCount: number;
    gameCropCount: number;
    confirmations: {
      timestamp: number;
      boundingBox: Record<string, unknown>;
      confidence: number;
    }[];
  };
  video: {
    provider: string;
    accessLevel: string;
    durationSeconds: number | null;
  };
  settings: {
    preRoll: number;
    postRoll: number;
  };
};

export type AnalysisStatusResult = {
  status: AnalysisJobStatus;
  progressPercent: number;
  currentStage: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type AnalysisTrackResult = {
  trackId: string;
  startTime: number;
  endTime: number;
  averageConfidence: number;
  identityConfidence: number;
  trackingConfidence: number;
  needsConfirmation: boolean;
  metadata: Record<string, unknown>;
};

export type AnalysisCandidateResult = {
  trackId: string;
  startTime: number;
  endTime: number;
  confidence: number;
  reason: CandidateReason;
  prediction: Record<string, unknown>;
};

export type AnalysisResults = {
  modelVersion: string;
  tracks: AnalysisTrackResult[];
  candidates: AnalysisCandidateResult[];
  summary: Record<string, unknown>;
};

export type AnalysisProvider = {
  key: string;
  /** Mock results must always be labelled in the UI. */
  isMock: boolean;
  submitAnalysisJob: (request: AnalysisSubmitRequest) => Promise<{ externalJobId: string | null }>;
  getAnalysisStatus: (context: {
    externalJobId: string | null;
    startedAt: string | null;
    request: AnalysisSubmitRequest;
  }) => Promise<AnalysisStatusResult>;
  getAnalysisResults: (context: {
    externalJobId: string | null;
    request: AnalysisSubmitRequest;
  }) => Promise<AnalysisResults>;
  cancelAnalysisJob: (context: { externalJobId: string | null }) => Promise<void>;
};

/* ------------------------------ mock provider ------------------------------ */

/** Deterministic pseudo-random so a job always yields the same demo output. */
function seeded(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return Math.abs(hash % 10000) / 10000;
  };
}

const MOCK_TOTAL_MS = 24_000;

const MOCK_TIMELINE: { until: number; status: AnalysisJobStatus; stage: string }[] = [
  { until: 0.15, status: "preparing_video", stage: "Preparing film" },
  { until: 0.4, status: "identifying_player", stage: "Identifying player" },
  { until: 0.7, status: "tracking_player", stage: "Tracking player" },
  { until: 0.95, status: "generating_candidates", stage: "Finding player involvement" },
  { until: 1.01, status: "ready_for_review", stage: "Candidate clips created" },
];

/**
 * Development-only provider. Produces sample tracks and candidates so the whole
 * review workflow can be exercised before a real CV service exists. Every row it
 * creates is flagged as demo output.
 */
export const mockAnalysisProvider: AnalysisProvider = {
  key: "mock",
  isMock: true,
  submitAnalysisJob: async ({ jobId }) => ({ externalJobId: `mock-${jobId.slice(0, 8)}` }),
  getAnalysisStatus: async ({ startedAt }) => {
    const started = startedAt ? new Date(startedAt).getTime() : Date.now();
    const ratio = Math.min(1, (Date.now() - started) / MOCK_TOTAL_MS);
    const step = MOCK_TIMELINE.find((entry) => ratio <= entry.until) ?? MOCK_TIMELINE.at(-1)!;
    return {
      status: step.status,
      progressPercent: Math.round(ratio * 100),
      currentStage: step.stage,
    };
  },
  getAnalysisResults: async ({ request }) => {
    const random = seeded(request.jobId);
    const duration = Math.max(120, request.video.durationSeconds ?? 900);
    const segmentCount = 8 + Math.floor(random() * 5);
    const tracks: AnalysisTrackResult[] = [];
    const candidates: AnalysisCandidateResult[] = [];

    let cursor = duration * 0.05;
    for (let index = 0; index < segmentCount; index += 1) {
      const gap = (duration / segmentCount) * (0.4 + random() * 0.7);
      cursor = Math.min(duration - 20, cursor + gap);
      const involvement = 2.5 + random() * 5;
      const identityConfidence = 0.45 + random() * 0.54;
      const trackingConfidence = 0.4 + random() * 0.58;
      const trackId = `t${index + 1}`;

      tracks.push({
        trackId,
        startTime: Math.max(0, cursor - 2),
        endTime: cursor + involvement + 2,
        averageConfidence: Number(((identityConfidence + trackingConfidence) / 2).toFixed(3)),
        identityConfidence: Number(identityConfidence.toFixed(3)),
        trackingConfidence: Number(trackingConfidence.toFixed(3)),
        needsConfirmation: trackingConfidence < CONFIRMATION_THRESHOLD,
        metadata: {
          demo: true,
          signals: ["jersey_number", "uniform_colors", "body_proportions", "tracking_continuity"],
          // Frame-level boxes stay in metadata; the relational table stays small.
          sample_boxes: [
            { t: Number(cursor.toFixed(2)), x: 0.4 + random() * 0.2, y: 0.35, w: 0.08, h: 0.22 },
          ],
        },
      });

      const reason = CANDIDATE_REASONS[Math.floor(random() * CANDIDATE_REASONS.length)]!;
      candidates.push({
        trackId,
        startTime: Math.max(0, cursor - DEFAULT_PRE_ROLL),
        endTime: Math.min(duration, cursor + involvement + DEFAULT_POST_ROLL),
        confidence: Number((0.4 + random() * 0.58).toFixed(3)),
        reason,
        prediction: {
          demo: true,
          involvement_window: { start: Number(cursor.toFixed(2)), end: Number((cursor + involvement).toFixed(2)) },
          pre_roll: request.settings.preRoll,
          post_roll: request.settings.postRoll,
          signals_used: ["jersey_number", "uniform_colors", "confirmed_frames"],
        },
      });
    }

    return {
      modelVersion: "mock-identify-track-0.1",
      tracks,
      candidates,
      summary: {
        demo: true,
        tracks: tracks.length,
        candidates: candidates.length,
        needs_confirmation: tracks.filter((track) => track.needsConfirmation).length,
      },
    };
  },
  cancelAnalysisJob: async () => {},
};

/* ------------------------------ http provider ------------------------------ */

/**
 * Provider-independent HTTP adapter. Any internal Python service, GPU inference
 * host or third-party video API that speaks this contract can be plugged in by
 * setting ANALYSIS_SERVICE_URL / ANALYSIS_SERVICE_API_KEY.
 */
function createHttpAnalysisProvider(baseUrl: string, apiKey: string | undefined): AnalysisProvider {
  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`analysis_service_${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    key: "external",
    isMock: false,
    submitAnalysisJob: (request) =>
      call<{ externalJobId: string | null }>("/jobs", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    getAnalysisStatus: ({ externalJobId }) =>
      call<AnalysisStatusResult>(`/jobs/${externalJobId}/status`, { method: "GET" }),
    getAnalysisResults: ({ externalJobId }) =>
      call<AnalysisResults>(`/jobs/${externalJobId}/results`, { method: "GET" }),
    cancelAnalysisJob: async ({ externalJobId }) => {
      await call(`/jobs/${externalJobId}/cancel`, { method: "POST", body: "{}" });
    },
  };
}

export function resolveAnalysisProvider(): AnalysisProvider {
  const baseUrl = process.env["ANALYSIS_SERVICE_URL"];
  if (baseUrl) {
    return createHttpAnalysisProvider(baseUrl, process.env["ANALYSIS_SERVICE_API_KEY"]);
  }
  // No real endpoint configured: development mock only, always labelled.
  return mockAnalysisProvider;
}

export function providerForKey(key: string): AnalysisProvider {
  if (key === "mock") return mockAnalysisProvider;
  return resolveAnalysisProvider();
}
