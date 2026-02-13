# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Indiekit plugin that adds a YouTube channel endpoint. It displays latest videos and live streaming status from YouTube channels (supports both single and multiple channels), with an admin dashboard and public JSON API endpoints.

## Development

This is an ESM module with no build step. Install dependencies with `npm install`.

No test suite is configured. Testing requires a running Indiekit instance with valid YouTube API credentials.

## Architecture

**Plugin Entry Point** (`index.js`):
- Exports a `YouTubeEndpoint` class that Indiekit loads as a plugin
- Registers protected routes (admin dashboard) and public routes (JSON API)
- Stores configuration in `Indiekit.config.application.youtubeConfig` for controller access
- Registers navigation items and shortcuts in Indiekit's UI
- Supports both single channel (backward compatible) and multi-channel mode

**YouTube API Client** (`lib/youtube-client.js`):
- Handles all YouTube Data API v3 interactions
- Implements in-memory caching with configurable TTL
- Uses uploads playlist method for quota efficiency (2 units) instead of search (100 units)
- Channel info cached for 24 hours; videos cached per `cacheTtl` option
- Two live status methods: `getLiveStatus()` (expensive, 100 units) and `getLiveStatusEfficient()` (cheap, 2 units)
- Channel resolution: accepts either `channelId` (UC...) or `channelHandle` (@username)
  - `channelHandle` is resolved via `forHandle` API parameter (removes @ prefix automatically)

**Controllers** (`lib/controllers/`):
- `dashboard.js` - Admin page rendering, multi-channel display, cache refresh via POST
- `videos.js` - `/api/videos` JSON endpoint (supports multi-channel aggregation)
- `channel.js` - `/api/channel` JSON endpoint (returns array for multi-channel mode)
- `live.js` - `/api/live` JSON endpoint with efficient vs full search modes (`?full=true`)
- All controllers support both single-channel (backward compatible) and multi-channel modes
- Multi-channel responses include both aggregated data and per-channel breakdowns

**Views/Templates**:
- `views/youtube.njk` - Admin dashboard template with multi-channel support
- `includes/@indiekit-endpoint-youtube-widget.njk` - Homepage widget for Indiekit admin
- `includes/@indiekit-endpoint-youtube-live.njk` - Reusable live status partial
- `includes/@indiekit-endpoint-youtube-videos.njk` - Reusable video list partial (compact)

**Locales**:
- `locales/en.json` - English translations for all UI strings

## Configuration Modes

### Single Channel (Backward Compatible)
```javascript
{
  channelId: "UC...",
  // OR
  channelHandle: "@username"
}
```

### Multi-Channel
```javascript
{
  channels: [
    { id: "UC...", name: "Channel 1" },
    { handle: "@username", name: "Channel 2" }
  ]
}
```

## API Response Shapes

**Single channel mode**: Flat responses (e.g., `{ videos: [...] }`)

**Multi-channel mode**: Includes both aggregated flat data (for backward compat) and per-channel breakdowns (e.g., `{ videos: [...], videosByChannel: {...} }`)

## API Quota Considerations

YouTube Data API has a 10,000 units/day default quota:
- `channels.list`, `playlistItems.list`, `videos.list`: 1 unit each
- `search.list`: 100 units (used only for full live status check with `?full=true`)

The plugin uses the playlist method by default for quota efficiency. With default caching (5 min), single channel uses ~600 units/day. Multi-channel multiplies by number of channels.

## Routes

**Protected (require auth)**:
- `GET /youtube/` - Dashboard
- `POST /youtube/refresh` - Clear cache and refetch data (returns JSON)

**Public JSON API**:
- `GET /youtube/api/videos?limit=N` - Latest videos
- `GET /youtube/api/channel` - Channel info
- `GET /youtube/api/live?full=true` - Live status (efficient by default, add `?full=true` for search API)

## Workspace Context

This plugin is part of the Indiekit development workspace at `/home/rick/code/indiekit-dev/`. See the workspace CLAUDE.md for the full repository map. It is deployed via `indiekit-cloudron/` and listed in its `indiekit.config.js` plugins array.
