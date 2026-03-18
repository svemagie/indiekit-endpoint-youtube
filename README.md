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

## YouTube Likes Sync

Sync your YouTube liked videos as "like" posts on your IndieWeb blog. Only **new likes** (added after connecting) produce posts — existing likes are baselined without generating any content.

### How it works

```
First sync after connecting:
  YouTube API → fetch all liked video IDs → store in youtubeLikesSeen collection
  (no posts created — baseline snapshot only)

Every subsequent sync (hourly background + manual trigger):
  YouTube API → fetch liked videos → compare against youtubeLikesSeen
    ↓ new like found (not in seen set)
  Mark as seen → generate markdown via publication.postTemplate()
    → write file to store (e.g. GitHub) via store.createFile()
    → insert post document into MongoDB posts collection
    ↓ already seen
  Skip
```

New like posts are created as **drafts** (`post-status: draft`) so they can be reviewed before publishing. The post content is `Video Title - Channel Name`.

The baseline prevents mass post creation when you connect an account with hundreds of existing likes.

### Store integration

Like posts are written to the configured Indiekit store (e.g. `@indiekit/store-github`) as markdown files, exactly like posts created via Micropub. The sync:

1. Builds JF2 properties (`like-of`, `name`, `content`, `post-status: draft`, etc.)
2. Strips internal `mp-*` and `post-type` keys (matching Micropub's `getPostTemplateProperties`)
3. Calls `publication.postTemplate(templateProperties)` to generate frontmatter + content
4. Calls `publication.store.createFile(path, content, { message })` to commit the file
5. Inserts the post document into MongoDB (Indiekit needs both)

The store commit message follows Indiekit's `storeMessageTemplate` format. If the store write fails, the error is logged but the MongoDB insert still happens (so the sync doesn't retry the same video).

Reset (`POST /youtube/likes/reset`) also deletes files from the store before removing MongoDB documents.

### Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Application type: Web application)
3. Add an authorized redirect URI: `https://yourdomain.com/youtube/likes/callback`
4. Make sure **YouTube Data API v3** is enabled for the project
5. Set the environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_OAUTH_CLIENT_ID` | Yes | OAuth 2.0 client ID |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | Yes | OAuth 2.0 client secret |

6. Add the OAuth config to your Indiekit configuration:

```javascript
"@rmdes/indiekit-endpoint-youtube": {
  mountPath: "/youtube",
  apiKey: process.env.YOUTUBE_API_KEY,
  channelId: process.env.YOUTUBE_CHANNEL_ID,
  oauth: {
    clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
  },
  likes: {
    syncInterval: 3_600_000,  // 1 hour (default)
    maxPages: 3,              // 50 likes per page, up to 150 per sync
    autoSync: true,           // enable background sync
  },
},
```

7. Visit `/youtube/likes` in the Indiekit admin panel and click **Connect YouTube Account**
8. Authorize access — your refresh token is stored in MongoDB and persists across restarts

> **Brand Account caveat:** If your YouTube channel runs under a Brand Account, you must select that account (not your personal Google account) during the OAuth consent screen. The `myRating=like` API only returns likes for the authenticated account. Selecting the wrong account results in an "account is closed" error.

### Likes Options

| Option | Default | Description |
|--------|---------|-------------|
| `oauth.clientId` | - | Google OAuth 2.0 client ID |
| `oauth.clientSecret` | - | Google OAuth 2.0 client secret |
| `likes.syncInterval` | `3600000` | Background sync interval in ms (1 hour) |
| `likes.maxPages` | `3` | Max pages per sync (50 likes/page) |
| `likes.autoSync` | `true` | Enable background periodic sync |

### Admin Dashboard (`/youtube/likes`)

The likes page in the Indiekit admin panel provides a full overview:

**Connection section**
- Green "Connected" badge when authorized, with a Disconnect button
- "Not connected" badge when not authorized, with a description and Connect button that initiates the OAuth flow

**Overview section** (only when connected)
- Summary table showing: videos seen (baseline + subsequent), like posts created, baseline status and timestamp, last sync timestamp
- Sync result counts from the most recent run (new / skipped / total)

**Sync section** (only when connected)
- "Sync Now" button to trigger a manual sync. Redirects back to the dashboard with a flash message showing results.

**Recent Likes section** (only when connected)
- List of the 10 most recent like posts with YouTube thumbnail, video title (linked), channel name, and publication date
- "View All" link to the JSON API when more than 10 likes exist

**Flash messages**
- Query-param driven via Indiekit's `notificationBanner`: `?connected=1` (success), `?disconnected=1` (notice), `?synced=N&skipped=N` (success), `?error=message` (error)

### Likes Routes

#### Admin Routes (require authentication)

| Route | Method | Description |
|-------|--------|-------------|
| `/youtube/likes` | GET | Dashboard: connection status, overview stats, sync controls, recent likes |
| `/youtube/likes/connect` | GET | Redirects to Google OAuth consent screen |
| `/youtube/likes/disconnect` | POST | Deletes stored OAuth tokens, redirects to dashboard |
| `/youtube/likes/sync` | POST | Triggers manual sync, redirects to dashboard with results |
| `/youtube/likes/reset` | POST | Deletes all like posts (store + MongoDB), seen IDs, and baseline |

#### Public Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/youtube/likes/callback` | GET | OAuth callback — Google redirects here after authorization |
| `/youtube/api/likes` | GET | JSON API for synced likes (`?limit=N&offset=N`, max 100) |

### MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `youtubeMeta` | OAuth tokens (`key: "oauth_tokens"`), sync status (`key: "likes_sync"`), baseline flag (`key: "likes_baseline"`) |
| `youtubeLikesSeen` | Set of all video IDs ever seen (indexed on `videoId`, unique). Prevents duplicate posts and ensures only new likes after baseline produce posts. |

### Likes API Response

#### GET /youtube/api/likes

```json
{
  "likes": [
    {
      "post-type": "like",
      "like-of": "https://www.youtube.com/watch?v=abc123",
      "name": "Video Title - Channel Name",
      "published": "2024-01-15T10:00:00Z",
      "url": "https://yourdomain.com/likes/yt-like-abc123/",
      "youtube-video-id": "abc123",
      "youtube-channel": "Channel Name",
      "youtube-thumbnail": "https://i.ytimg.com/vi/abc123/mqdefault.jpg"
    }
  ],
  "count": 20,
  "total": 142,
  "offset": 0
}
```

### Likes Quota Usage

Fetching liked videos uses `videos.list` with `myRating=like` — **1 quota unit per page** (50 videos). With default settings (3 pages per sync, hourly), that's ~72 units/day.

### Eleventy Integration for Likes

```javascript
// _data/youtubeLikes.js
import EleventyFetch from "@11ty/eleventy-fetch";

export default async function() {
  const baseUrl = process.env.SITE_URL || "https://example.com";
  const data = await EleventyFetch(
    `${baseUrl}/youtube/api/likes?limit=50`,
    { duration: "15m", type: "json" }
  );
  return data.likes;
}
```

### Troubleshooting

**"The YouTube account of the authenticated user is closed"**
You authorized the wrong Google account. Your liked videos live on a Brand Account, but OAuth used your personal account. Disconnect (`POST /youtube/likes/disconnect`), reconnect, and pick the correct account.

**First sync created zero posts**
This is expected. The first sync snapshots existing likes as baseline. Posts are only created for likes added after that point.

**Want to reset everything?**
Use the Reset button on the `/youtube/likes` dashboard (or `POST /youtube/likes/reset`). This deletes all like post files from the store, removes all MongoDB documents (posts, seen IDs, baseline, sync status), and starts fresh. The next sync will re-baseline.

**Posts created but files missing from store**
If you upgraded from a version that only wrote to MongoDB, use Reset to clear the old posts and re-sync. New syncs will write both the markdown file and the MongoDB document.

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
