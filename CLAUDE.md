# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Indiekit plugin that adds a YouTube channel endpoint. It displays latest videos and live streaming status from a YouTube channel, with both an admin dashboard and public JSON API endpoints.

## Development

This is an ESM module with no build step. Install dependencies with `npm install`.

No test suite is configured. Testing requires a running Indiekit instance with valid YouTube API credentials.

## Architecture

**Plugin Entry Point** (`index.js`):
- Exports a `YouTubeEndpoint` class that Indiekit loads as a plugin
- Registers protected routes (admin dashboard) and public routes (JSON API)
- Stores configuration in `Indiekit.config.application.youtubeConfig` for controller access

**YouTube API Client** (`lib/youtube-client.js`):
- Handles all YouTube Data API v3 interactions
- Implements in-memory caching with configurable TTL
- Uses uploads playlist method for quota efficiency (2 units) instead of search (100 units)
- Channel info cached for 24 hours; videos cached per `cacheTtl` option

**Controllers** (`lib/controllers/`):
- `dashboard.js` - Admin page rendering, cache refresh
- `videos.js` - `/api/videos` JSON endpoint
- `channel.js` - `/api/channel` JSON endpoint
- `live.js` - `/api/live` JSON endpoint with efficient vs full search modes

**Views/Templates**:
- `views/youtube.njk` - Admin dashboard template (Nunjucks)
- `includes/@indiekit-endpoint-youtube-widget.njk` - Widget component

## API Quota Considerations

YouTube Data API has a 10,000 units/day default quota:
- `channels.list`, `playlistItems.list`, `videos.list`: 1 unit each
- `search.list`: 100 units (used only for full live status check with `?full=true`)

The plugin uses the playlist method by default for quota efficiency.
