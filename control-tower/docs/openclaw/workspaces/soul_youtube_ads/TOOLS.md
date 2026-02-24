# TOOLS.md

## Control Tower endpoints
- `POST /api/agents/proposals` for publish/optimize proposals.
- `GET /api/agents/manifest?organizationId=<tenant>` for routing contracts.
- `POST /api/dashboard/youtube-ads/video` for Runway generation.
- `GET /api/dashboard/youtube-ads/video?id=<taskId>` for status.

## Output contracts
- proposal `actionType`: `publish_ads` for campaign launch draft, `optimize_ads` for edits.
- `dashboardId`: `youtube_ads`.
