# Clarify Film and Analysis Status

## Goal
Make the game screens accurately communicate that uploaded film is ready while automated analysis is not yet available in this phase.

## Changes
- Label the two game-detail statuses explicitly as **Film** and **Analysis** so they cannot be confused.
- Display the uploaded asset/game film state as **Film Ready** when `video_status` is `ready_for_review`.
- Translate the current untouched `analysis_status: upload_pending` into honest Phase 2 copy such as **Analysis Not Started**, rather than the misleading **Upload Pending**.
- Keep the Games list focused on film readiness and ensure its status filter continues to use `video_status`.
- Adjust empty-state copy that currently implies clips are automatically generated after analysis; manual Mark Play remains the supported workflow.

## Technical Details
- Add context-specific presentation helpers for film and analysis labels rather than changing the shared workflow enum or persisted records.
- Do not add AI, background processing jobs, computer vision, or automatic analysis.
- Preserve the uploaded asset and backend values; the existing upload is confirmed `ready`, with the game film status `ready_for_review`.

## Verification
- Confirm the uploaded game shows **Film Ready** and **Analysis Not Started** on its detail page.
- Confirm the Games list shows **Film Ready** after refresh.
- Confirm no screen claims automated analysis or clip generation is currently running.