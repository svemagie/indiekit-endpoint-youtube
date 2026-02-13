# @rmdes/indiekit-endpoint-youtube

[![npm version](https://img.shields.io/npm/v/@rmdes/indiekit-endpoint-youtube.svg)](https://www.npmjs.com/package/@rmdes/indiekit-endpoint-youtube)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

YouTube channel endpoint for [Indiekit](https://getindiekit.com/).

Display latest videos and live streaming status from any YouTube channel (or multiple channels) on your IndieWeb site.

## Installation

Install from npm:

```bash
npm install @rmdes/indiekit-endpoint-youtube
```

## Features

- **Single or Multi-Channel** - Monitor one channel or aggregate multiple channels
- **Admin Dashboard** - Overview of channel(s) with latest videos in Indiekit's admin UI
- **Live Status** - Shows when channel is live streaming (with animated badge)
- **Upcoming Streams** - Display scheduled upcoming live streams
- **Latest Videos** - Grid of recent uploads with thumbnails, duration, view counts
- **Public JSON API** - For integration with static site generators like Eleventy
- **Quota Efficient** - Uses YouTube API efficiently (playlist method vs search)
- **Smart Caching** - Respects API rate limits while staying current

## Configuration

### Single Channel

Add to your `indiekit.config.js`:

```javascript
import YouTubeEndpoint from "@rmdes/indiekit-endpoint-youtube";

export default {
  plugins: [
    new YouTubeEndpoint({
      mountPath: "/youtube",
      apiKey: process.env.YOUTUBE_API_KEY,
      channelId: process.env.YOUTUBE_CHANNEL_ID,
      // OR use channel handle instead:
      // channelHandle: "@YourChannel",
      cacheTtl: 300_000,      // 5 minutes
      liveCacheTtl: 60_000,   // 1 minute for live status
      limits: {
        videos: 10,
      },
    }),
  ],
};
```

### Multiple Channels

Monitor multiple YouTube channels simultaneously:

```javascript
import YouTubeEndpoint from "@rmdes/indiekit-endpoint-youtube";

export default {
  plugins: [
    new YouTubeEndpoint({
      mountPath: "/youtube",
      apiKey: process.env.YOUTUBE_API_KEY,
      channels: [
        { id: "UC...", name: "Main Channel" },
        { handle: "@SecondChannel", name: "Second Channel" },
        { id: "UC...", name: "Third Channel" },
      ],
      cacheTtl: 300_000,
      liveCacheTtl: 60_000,
      limits: {
        videos: 10,
      },
    }),
  ],
};
```

In multi-channel mode:
- Dashboard shows all channels with separate sections
- API endpoints aggregate data from all channels
- Videos are sorted by date across all channels
- Live status shows any channel that is currently live

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 key |
| `YOUTUBE_CHANNEL_ID` | Yes* | Channel ID (starts with `UC...`) |
| `YOUTUBE_CHANNEL_HANDLE` | Yes* | Channel handle (e.g., `@YourChannel`) |

*Either `channelId` or `channelHandle` is required for single-channel mode. In multi-channel mode, use the `channels` array instead.

### Getting a YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "YouTube Data API v3"
4. Go to Credentials > Create Credentials > API Key
5. (Optional) Restrict the key to YouTube Data API only

### Finding Your Channel ID

- Go to your YouTube channel
- The URL will be `youtube.com/channel/UC...` - the `UC...` part is your channel ID
- Or use a tool like [Comment Picker](https://commentpicker.com/youtube-channel-id.php)

## Routes

### Admin Routes (require authentication)

| Route | Description |
|-------|-------------|
| `GET /youtube/` | Dashboard with channel info, live status, latest videos |
| `POST /youtube/refresh` | Clear cache and refresh data (returns JSON) |

### Public API Routes (JSON)

| Route | Description |
|-------|-------------|
| `GET /youtube/api/videos` | Latest videos (supports `?limit=N`) |
| `GET /youtube/api/channel` | Channel information |
| `GET /youtube/api/live` | Live streaming status (efficient by default) |
| `GET /youtube/api/live?full=true` | Live status using search API (more accurate, costs more quota) |

### Example: Eleventy Integration

```javascript
// _data/youtube.js
import EleventyFetch from "@11ty/eleventy-fetch";

export default async function() {
  const baseUrl = process.env.SITE_URL || "https://example.com";

  const [channel, videos, live] = await Promise.all([
    EleventyFetch(`${baseUrl}/youtube/api/channel`, { duration: "15m", type: "json" }),
    EleventyFetch(`${baseUrl}/youtube/api/videos?limit=6`, { duration: "5m", type: "json" }),
    EleventyFetch(`${baseUrl}/youtube/api/live`, { duration: "1m", type: "json" }),
  ]);

  return {
    channel: channel.channel,
    videos: videos.videos,
    isLive: live.isLive,
    liveStream: live.stream,
  };
}
```

## API Response Examples

### GET /youtube/api/live

**Single channel:**
```json
{
  "isLive": true,
  "isUpcoming": false,
  "stream": {
    "videoId": "abc123",
    "title": "Live Stream Title",
    "thumbnail": "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
    "url": "https://www.youtube.com/watch?v=abc123"
  },
  "cached": true
}
```

**Multi-channel:**
```json
{
  "isLive": true,
  "isUpcoming": false,
  "stream": {
    "videoId": "abc123",
    "title": "Live Stream Title"
  },
  "liveStatuses": [
    {
      "channelConfigName": "Main Channel",
      "isLive": true,
      "stream": { "videoId": "abc123" }
    },
    {
      "channelConfigName": "Second Channel",
      "isLive": false,
      "stream": null
    }
  ],
  "cached": true
}
```

### GET /youtube/api/videos

**Single channel:**
```json
{
  "videos": [
    {
      "id": "abc123",
      "title": "Video Title",
      "thumbnail": "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
      "duration": 3661,
      "durationFormatted": "1:01:01",
      "viewCount": 12345,
      "publishedAt": "2024-01-15T10:00:00Z",
      "url": "https://www.youtube.com/watch?v=abc123",
      "isLive": false
    }
  ],
  "count": 10,
  "cached": true
}
```

**Multi-channel:**
```json
{
  "videos": [],
  "videosByChannel": {
    "Main Channel": [],
    "Second Channel": []
  },
  "count": 20,
  "cached": true
}
```

### GET /youtube/api/channel

**Single channel:**
```json
{
  "channel": {
    "id": "UC...",
    "title": "Channel Name",
    "description": "Channel description",
    "thumbnail": "https://...",
    "subscriberCount": 12345,
    "videoCount": 100,
    "viewCount": 999999
  },
  "cached": true
}
```

**Multi-channel:**
```json
{
  "channels": [
    { "id": "UC...", "title": "Channel 1", "configName": "Main Channel" },
    { "id": "UC...", "title": "Channel 2", "configName": "Second Channel" }
  ],
  "channel": {},
  "cached": true
}
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `mountPath` | `/youtube` | URL path for the endpoint |
| `apiKey` | - | YouTube Data API key |
| `channelId` | - | Channel ID (UC...) - single channel mode |
| `channelHandle` | - | Channel handle (@...) - single channel mode |
| `channels` | `null` | Array of channels for multi-channel mode |
| `cacheTtl` | `300000` | Cache TTL in ms (5 min) |
| `liveCacheTtl` | `60000` | Live status cache TTL in ms (1 min) |
| `limits.videos` | `10` | Number of videos to fetch per channel |

### Channels Array Format

For multi-channel mode, the `channels` option accepts an array of objects:

```javascript
channels: [
  { id: "UC...", name: "Display Name" },          // Using channel ID
  { handle: "@username", name: "Display Name" },  // Using handle
  { id: "UC..." }                                  // Name defaults to channel title
]
```

Either `id` or `handle` is required. The `name` field is optional and used for display purposes.

## Quota Efficiency

YouTube Data API has a daily quota (10,000 units by default). This plugin is optimized:

| Operation | Quota Cost | Method |
|-----------|------------|--------|
| Get videos | 2 units | Uses uploads playlist (not search) |
| Get channel | 1 unit | Cached for 24 hours |
| Check live status (efficient) | 2 units | Checks recent videos |
| Check live status (full) | 100 units | Only when explicitly requested |

**Single channel:** With default settings (5-min cache), ~600 units/day.

**Multi-channel:** Quota usage scales linearly. 3 channels = ~1,800 units/day.

## Requirements

- Indiekit >= 1.0.0-beta.25
- YouTube Data API v3 enabled
- Valid API key with YouTube Data API access
- Node.js >= 20

## License

MIT
