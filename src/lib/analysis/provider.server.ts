/**
 * External analysis-service adapter.
 *
 * The application never runs computer vision itself. It submits a job to the
 * configured provider and reads back a structured result. The production
 * provider is the Python CV service in `cv-service/` (FastAPI + OpenCV +
 * PyTorch); the mock provider exists only for development.
 *
 * Production NEVER silently falls back to mock. When no real service is
 * configured (or it is unreachable) the job fails with
 * `analysis_service_unavailable` and the UI says "Analysis service unavailable".
 */

import {
  CANDIDATE_REASONS,
  CONFIRMATION_THRESHOLD,
  DEFAULT_POST_ROLL,
  DEFAULT_PRE_ROLL,
  type AnalysisJobStatus,
  type CandidateReason,
} from "@/lib/analysis/analysis";

export type AnalysisReference = {
  kind: "confirmed_game_crop" | "game_crop" | "photo" | "reference_video";
  /** Authorized, short-lived URL the CV service can fetch. */
  url: string;
  /** Only user-confirmed material is high trust. */
  trust: "high" | "medium" | "low";
  sourceGameId?: string | null;
  capturedAt?: string | null;
};

export type AnalysisSubmitRequest = {
  jobId: string;
  gameId: string;
  videoAssetId: string;
  playerId: string;
  sportId: string | null;
  sport: string | null;
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
  /** Reference media the service may fetch to build appearance signatures. */
  references: AnalysisReference[];
  video: {
    provider: string;
    accessLevel: string;
    durationSeconds: number | null;
    /** Authorized, short-lived URL to the raw film. Temporary by contract. */
    url: string | null;
    mimeType?: string | null;
  };
  settings: {
    preRoll: number;
    postRoll: number;
    analysisFps: number;
    detectionResolution: number;
    detectionConfidence: number;
    identityHighThreshold: number;
    identityMediumThreshold: number;
    confirmationThreshold: number;
    ballDetection: boolean;
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

export type AnalysisNeedsConfirmation = {
  timestamp: number;
  reason?: string | null;
  candidates: {
    trackId: string;
    boundingBox: Record<string, unknown>;
    identityConfidence: number;
  }[];
};

export type AnalysisModelVersions = {
  personDetectorVersion: string;
  trackerVersion: string;
  reidentificationVersion: string;
  serviceVersion: string;
};

export type AnalysisMetrics = {
  videoDurationSeconds?: number | null;
  analysisDurationSeconds?: number | null;
  processingSeconds?: number | null;
  framesAnalyzed?: number;
  analysisFps?: number;
  detections?: number;
  detectionsPerFrame?: number;
  tracks?: number;
  targetTrackingCoverage?: number;
  targetVisibleSeconds?: number;
  targetTrackChanges?: number;
  lowConfidenceIntervals?: number;
  confirmationsRequested?: number;
  confirmationsMatched?: number;
  referenceImagesUsed?: number;
  confirmedReferencesUsed?: number;
  meanIdentityConfidence?: number;
  ballDetectedFrames?: number;
  candidateClips?: number;
  /** Providers may report additional diagnostic counters. */
  [key: string]: unknown;
};

/** Sample frames with drawn boxes — admin/debug only, never shown to athletes. */
export type AnalysisDebugFrame = {
  timestamp: number;
  imageUrl?: string | null;
  imageBase64?: string | null;
  boxes: {
    trackId: string;
    isTarget: boolean;
    detectionConfidence: number;
    identityConfidence: number;
    box: { x: number; y: number; w: number; h: number };
  }[];
};

export type AnalysisResults = {
  modelVersion: string;
  modelVersions?: AnalysisModelVersions;
  tracks: AnalysisTrackResult[];
  candidates: AnalysisCandidateResult[];
  needsConfirmation?: AnalysisNeedsConfirmation[];
  metrics?: AnalysisMetrics;
  debugFrames?: AnalysisDebugFrame[];
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

/** Job-level analysis settings, configurable through environment variables. */
export function resolveAnalysisSettings(overrides?: Record<string, unknown>) {
  const num = (key: string, fallback: number) => {
    const raw = process.env[key];
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    preRoll: Number(overrides?.["pre_roll"] ?? num("ANALYSIS_PRE_ROLL", DEFAULT_PRE_ROLL)),
    postRoll: Number(overrides?.["post_roll"] ?? num("ANALYSIS_POST_ROLL", DEFAULT_POST_ROLL)),
    analysisFps: Number(overrides?.["analysis_fps"] ?? num("ANALYSIS_FPS", 5)),
    detectionResolution: Number(
      overrides?.["detection_resolution"] ?? num("ANALYSIS_DETECTION_RESOLUTION", 960),
    ),
    detectionConfidence: Number(
      overrides?.["detection_confidence"] ?? num("ANALYSIS_DETECTION_CONFIDENCE", 0.35),
    ),
    identityHighThreshold: num("ANALYSIS_IDENTITY_HIGH", 0.8),
    identityMediumThreshold: num("ANALYSIS_IDENTITY_MEDIUM", 0.55),
    confirmationThreshold: num("ANALYSIS_CONFIRMATION_THRESHOLD", CONFIRMATION_THRESHOLD),
    ballDetection: (process.env["ANALYSIS_BALL_DETECTION"] ?? "true") !== "false",
  };
}

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
 * review workflow can be exercised without a GPU. Every row it creates is
 * flagged as demo output and it is never selected in production.
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
          sample_boxes: [
            { t: Number(cursor.toFixed(2)), x: 0.4 + random() * 0.2, y: 0.35, w: 0.08, h: 0.22 },
          ],
        },
      });

      const reason = CANDIDATE_REASONS[Math.floor(random() * CANDIDATE_REASONS.length)]!;
      candidates.push({
        trackId,
        startTime: Math.max(0, cursor - request.settings.preRoll),
        endTime: Math.min(duration, cursor + involvement + request.settings.postRoll),
        confidence: Number((0.4 + random() * 0.58).toFixed(3)),
        reason,
        prediction: {
          demo: true,
          involvement_window: {
            start: Number(cursor.toFixed(2)),
            end: Number((cursor + involvement).toFixed(2)),
          },
          pre_roll: request.settings.preRoll,
          post_roll: request.settings.postRoll,
          signals_used: ["jersey_number", "uniform_colors", "confirmed_frames"],
        },
      });
    }

    return {
      modelVersion: "mock-identify-track-0.1",
      modelVersions: {
        personDetectorVersion: "mock-detector-0.1",
        trackerVersion: "mock-tracker-0.1",
        reidentificationVersion: "mock-reid-0.1",
        serviceVersion: "mock-0.1",
      },
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

class AnalysisServiceUnavailable extends Error {
  constructor(detail?: string) {
    super(detail ? `analysis_service_unavailable: ${detail}` : "analysis_service_unavailable");
    this.name = "AnalysisServiceUnavailable";
  }
}

export const ANALYSIS_SERVICE_UNAVAILABLE_CODE = "analysis_service_unavailable";

export function isServiceUnavailable(error: unknown): boolean {
  return (
    error instanceof AnalysisServiceUnavailable ||
    (error instanceof Error && error.message.includes(ANALYSIS_SERVICE_UNAVAILABLE_CODE))
  );
}

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Provider-independent HTTP adapter for the real CV service. Credentials live
 * only in server env (`ANALYSIS_SERVICE_URL`, `ANALYSIS_SERVICE_API_KEY`) and
 * never reach the browser.
 */
function createHttpAnalysisProvider(baseUrl: string, apiKey: string | undefined): AnalysisProvider {
  async function call<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (networkError) {
      // Unreachable service: fail loudly, never degrade to demo output.
      throw new AnalysisServiceUnavailable(
        networkError instanceof Error ? networkError.message : "network error",
      );
    }
    if (response.status >= 500 || response.status === 401 || response.status === 403) {
      throw new AnalysisServiceUnavailable(`status ${response.status}`);
    }
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

/** True when a real CV endpoint is configured. */
export function hasRealAnalysisService(): boolean {
  return Boolean(process.env["ANALYSIS_SERVICE_URL"]);
}

/**
 * Mock is opt-in only: it requires ANALYSIS_PROVIDER=mock AND the absence of a
 * real endpoint. Anything else resolves to the real service, or fails.
 */
export function mockExplicitlyEnabled(): boolean {
  return process.env["ANALYSIS_PROVIDER"] === "mock" && !hasRealAnalysisService();
}

export function resolveAnalysisProvider(): AnalysisProvider {
  const baseUrl = process.env["ANALYSIS_SERVICE_URL"];
  if (baseUrl) {
    return createHttpAnalysisProvider(baseUrl, process.env["ANALYSIS_SERVICE_API_KEY"]);
  }
  if (mockExplicitlyEnabled()) return mockAnalysisProvider;
  // No real endpoint and mock not explicitly enabled: never fake a result.
  throw new AnalysisServiceUnavailable("ANALYSIS_SERVICE_URL is not configured");
}

export function providerForKey(key: string): AnalysisProvider {
  // Existing mock jobs keep resolving to mock so history stays readable.
  if (key === "mock") return mockAnalysisProvider;
  return resolveAnalysisProvider();
}
