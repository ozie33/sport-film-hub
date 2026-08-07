# Phase 2.5 — Google Drive as a video source + sharing foundation

Goal: stop treating app storage as the home for full game film, add Google Drive as a first-class provider, and lay the coach-to-player sharing groundwork. No computer vision in this phase.

## 1. Connect Google Drive (per user)

Each signed-in user connects their own Drive account through Lovable's Google Drive app-user connector. Tokens live server-side only; the browser never sees a Google credential.

- A one-time workspace setup step creates the Google OAuth client (I'll open that setup card during the build; you'll register the Google client and the Lovable callback URL).
- Settings → Connected Services gains a real **Connect Google Drive / Disconnect** card next to YouTube and Hudl, showing the connected Google account.
- Each user's connection handle is stored encrypted in a server-only table, keyed to their account, and mirrored into the existing `video_provider_connections` row so the UI can read connection state without touching secrets.

## 2. Google Drive provider adapter

New `google_drive` provider using the same adapter interface as Upload / YouTube / Hudl, so Film Room keeps asking the capability matrix instead of branching on provider names.

Capabilities when the file is authorized: playback, timestamp seeking, playback speed, manual clipping, raw video access, server-side processing, computer-vision-eligible, export, sharing. When the connection is missing or the file lost access: playback off, link-only fallback, clipping metadata preserved.

## 3. Pick an existing Drive video

Add Film gains a fourth card, **Google Drive**:

- Browse / search the user's Drive videos (MP4, MOV, M4V), newest first, with folder navigation and a search box.
- Selecting a file creates a `video_assets` row holding only the reference: provider, external file id, filename, mime type, file size, duration when Drive reports it, thumbnail, connection id, permissions state, and raw provider metadata.
- The file is never copied into app storage.

## 4. Device upload → choose a destination

When a local file is selected, a destination step asks "Where should this video be stored?" with **My Google Drive** (recommended, preselected when Drive is connected) and **Application storage**.

- Drive route: the server starts a resumable Drive upload session, the browser streams the file straight to Google with the same progress bar, cancel, and status chips as today; on completion we create the asset from the returned Drive file id. Nothing is duplicated in app storage.
- Application storage keeps today's behaviour exactly.

## 5. Drive playback in Film Room

Drive-backed assets play in the existing native player through an authorized server-side stream that supports range requests, so scrubbing, playback speed, Mark Play (I / O / Enter), timeline seeking and continuous Player Cut all work unchanged. If the stream is unavailable (revoked access, unsupported codec) the player degrades to a clear "Open in Google Drive" state rather than an error.

## 6. Sharing foundation

New reusable `shared_resources` model: resource type (game, playlist, film review, reel, development report), resource id, shared-by, shared-with, permission (`view` / `comment`), status, created/viewed timestamps. No team/org permissions yet.

- **Share with player** action on playlists and film reviews: pick the recipient, set view permission, then the app checks whether the recipient can open the underlying source video.
- If the recipient lacks access to a Drive file and the coach's Google account is allowed to share it, a **Grant view access** action adds them server-side. Provider errors are translated into plain language — "[Player] does not currently have access to this source video" — never raw API text.
- YouTube shares stay as video id + start/end + event + note, played in the official embed. Hudl shares are capability-honest: the film review is shared, with a clear note that opening the source may require Hudl access.
- Recipients get a **Shared with me** section in Film Room (and a dashboard entry point) that opens on desktop or mobile in the same provider-aware player.

## 7. Storage strategy & cleanup

App storage becomes staging, not a library: assets gain `is_temporary`, `expires_at`, and `cleanup_status`, with a cleanup hook that removes expired staged files. Permanent full-game hosting is no longer assumed; the database owns games, source references, timestamps, events, clips, tags, evaluations, playlists, permissions, shares and development data.

## 8. Phase 3 readiness

The Drive adapter exposes an authorized server-side raw-file retrieval path so a future external CV service can stream the file into a temporary analysis environment and delete the temporary copy afterwards. No CV code in this phase.

## Verification

I'll run through the four acceptance flows in a browser against the running app — YouTube paste → mark → playlist → share → recipient playback; Drive existing file → attach → play → mark → share; device file → My Google Drive → upload → play; and coach share → source permission check → recipient "Shared with me" — plus a clean typecheck and console.

## Technical notes

- Provider enum extended with `google_drive`; migrations add `shared_resources` (RLS scoped to sharer and recipient, plus GRANTs), the encrypted per-user connection table, and the temporary-storage columns on `video_assets`.
- All Drive calls go through the connector gateway inside server functions (`*.functions.ts` + `*.server.ts`), including a range-aware streaming server route for playback.
- Resumable upload uses a server-created Drive session URL so bytes go browser → Google directly with no token exposure.
- Existing Phase 2 code paths (YouTube IFrame, Hudl link-only, Mark Play shortcuts, timeline, playlists, Player Cut, capability matrix) are extended, not rewritten.
