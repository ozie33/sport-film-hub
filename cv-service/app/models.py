"""Wire contract shared with the application backend."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class Confirmation(BaseModel):
    timestamp: float
    boundingBox: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 1.0


class IdentityContext(BaseModel):
    team: str | None = None
    jerseyNumber: str | None = None
    position: str | None = None
    season: str | None = None
    uniformPrimaryColor: str | None = None
    uniformSecondaryColor: str | None = None
    referencePhotoCount: int = 0
    referenceVideoCount: int = 0
    gameCropCount: int = 0
    confirmations: list[Confirmation] = Field(default_factory=list)


class Reference(BaseModel):
    kind: Literal["confirmed_game_crop", "game_crop", "photo", "reference_video"]
    url: str
    trust: Literal["high", "medium", "low"] = "medium"
    sourceGameId: str | None = None
    capturedAt: str | None = None


class VideoSource(BaseModel):
    provider: str
    accessLevel: str
    durationSeconds: float | None = None
    url: str | None = None
    mimeType: str | None = None


class JobSettings(BaseModel):
    preRoll: float = 3.0
    postRoll: float = 4.0
    analysisFps: float = 2.0
    detectionResolution: int = 640
    detectionConfidence: float = 0.35
    identityHighThreshold: float = 0.80
    identityMediumThreshold: float = 0.55
    confirmationThreshold: float = 0.55
    ballDetection: bool = True


class JobRequest(BaseModel):
    jobId: str
    gameId: str
    videoAssetId: str
    playerId: str
    sportId: str | None = None
    sport: str | None = None
    analysisType: str = "player_identification_tracking"
    identityContext: IdentityContext = Field(default_factory=IdentityContext)
    references: list[Reference] = Field(default_factory=list)
    video: VideoSource
    settings: JobSettings = Field(default_factory=JobSettings)


class SubmitResponse(BaseModel):
    externalJobId: str


class StatusResponse(BaseModel):
    status: str
    progressPercent: int
    currentStage: str | None = None
    errorCode: str | None = None
    errorMessage: str | None = None
