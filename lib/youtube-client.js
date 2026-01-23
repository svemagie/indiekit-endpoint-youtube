/**
 * YouTube Data API v3 client
 * Optimized for quota efficiency (10,000 units/day default)
 *
 * Quota costs:
 * - channels.list: 1 unit
 * - playlistItems.list: 1 unit
 * - videos.list: 1 unit
 * - search.list: 100 units (avoid!)
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";

// In-memory cache
const cache = new Map();

/**
 * Get cached data or null if expired
 * @param {string} key - Cache key
 * @param {number} ttl - TTL in milliseconds
 * @returns {any|null}
 */
function getCache(key, ttl) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.time > ttl) {
    cache.delete(key);
    return null;
  }
  return cached.data;
}

/**
 * Set cache data
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

export class YouTubeClient {
  /**
   * @param {object} options
   * @param {string} options.apiKey - YouTube Data API key
   * @param {string} options.channelId - Channel ID (UC...)
   * @param {string} [options.channelHandle] - Channel handle (@...)
   * @param {number} [options.cacheTtl] - Cache TTL in ms (default: 5 min)
   * @param {number} [options.liveCacheTtl] - Live status cache TTL in ms (default: 1 min)
   */
  constructor(options) {
    this.apiKey = options.apiKey;
    this.channelId = options.channelId;
    this.channelHandle = options.channelHandle;
    this.cacheTtl = options.cacheTtl || 300_000; // 5 minutes
    this.liveCacheTtl = options.liveCacheTtl || 60_000; // 1 minute
  }

  /**
   * Make API request
   * @param {string} endpoint - API endpoint
   * @param {object} params - Query parameters
   * @returns {Promise<object>}
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${API_BASE}/${endpoint}`);
    url.searchParams.set("key", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message = error.error?.message || response.statusText;
      throw new Error(`YouTube API error: ${message}`);
    }

    return response.json();
  }

  /**
   * Get channel info (cached)
   * @returns {Promise<object>} - Channel info including uploads playlist ID
   */
  async getChannelInfo() {
    const cacheKey = `channel:${this.channelId || this.channelHandle}`;
    const cached = getCache(cacheKey, 86_400_000); // 24 hour cache for channel info
    if (cached) return cached;

    const params = {
      part: "snippet,contentDetails,statistics,brandingSettings",
    };

    // Use channelId if available, otherwise resolve from handle
    if (this.channelId) {
      params.id = this.channelId;
    } else if (this.channelHandle) {
      // Remove @ if present
      const handle = this.channelHandle.replace(/^@/, "");
      params.forHandle = handle;
    } else {
      throw new Error("Either channelId or channelHandle is required");
    }

    const data = await this.request("channels", params);

    if (!data.items || data.items.length === 0) {
      throw new Error("Channel not found");
    }

    const channel = data.items[0];
    const result = {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      customUrl: channel.snippet.customUrl,
      thumbnail: channel.snippet.thumbnails?.medium?.url,
      subscriberCount: parseInt(channel.statistics.subscriberCount, 10) || 0,
      videoCount: parseInt(channel.statistics.videoCount, 10) || 0,
      viewCount: parseInt(channel.statistics.viewCount, 10) || 0,
      uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
      bannerUrl: channel.brandingSettings?.image?.bannerExternalUrl,
    };

    setCache(cacheKey, result);
    return result;
  }

  /**
   * Get latest videos from channel
   * Uses uploads playlist for quota efficiency (1 unit vs 100 for search)
   * @param {number} [maxResults=10] - Number of videos to fetch
   * @returns {Promise<Array>} - List of videos
   */
  async getLatestVideos(maxResults = 10) {
    const cacheKey = `videos:${this.channelId || this.channelHandle}:${maxResults}`;
    const cached = getCache(cacheKey, this.cacheTtl);
    if (cached) return cached;

    // Get channel info to get uploads playlist ID
    const channel = await this.getChannelInfo();
    if (!channel.uploadsPlaylistId) {
      throw new Error("Could not find uploads playlist");
    }

    // Get playlist items (1 quota unit)
    const playlistData = await this.request("playlistItems", {
      part: "snippet,contentDetails",
      playlistId: channel.uploadsPlaylistId,
      maxResults: Math.min(maxResults, 50),
    });

    if (!playlistData.items || playlistData.items.length === 0) {
      setCache(cacheKey, []);
      return [];
    }

    // Get video details for duration, view count, live status (1 quota unit)
    const videoIds = playlistData.items
      .map((item) => item.contentDetails.videoId)
      .join(",");

    const videosData = await this.request("videos", {
      part: "snippet,contentDetails,statistics,liveStreamingDetails",
      id: videoIds,
    });

    const videos = videosData.items.map((video) => this.formatVideo(video));

    setCache(cacheKey, videos);
    return videos;
  }

  /**
   * Check if channel is currently live
   * @returns {Promise<object|null>} - Live stream info or null
   */
  async getLiveStatus() {
    const cacheKey = `live:${this.channelId || this.channelHandle}`;
    const cached = getCache(cacheKey, this.liveCacheTtl);
    if (cached !== undefined) return cached;

    // Get channel info first to ensure we have the channel ID
    const channel = await this.getChannelInfo();

    // Search for live broadcasts (costs 100 quota units - use sparingly)
    // Only do this check periodically
    try {
      const data = await this.request("search", {
        part: "snippet",
        channelId: channel.id,
        eventType: "live",
        type: "video",
        maxResults: 1,
      });

      if (data.items && data.items.length > 0) {
        const liveItem = data.items[0];
        const result = {
          isLive: true,
          videoId: liveItem.id.videoId,
          title: liveItem.snippet.title,
          thumbnail: liveItem.snippet.thumbnails?.medium?.url,
          startedAt: liveItem.snippet.publishedAt,
        };
        setCache(cacheKey, result);
        return result;
      }

      setCache(cacheKey, null);
      return null;
    } catch (error) {
      console.error("[YouTube] Live status check error:", error.message);
      setCache(cacheKey, null);
      return null;
    }
  }

  /**
   * Get live status efficiently by checking recent videos
   * This uses less quota than search.list
   * @returns {Promise<object|null>} - Live stream info or null
   */
  async getLiveStatusEfficient() {
    const cacheKey = `live-eff:${this.channelId || this.channelHandle}`;
    const cached = getCache(cacheKey, this.liveCacheTtl);
    if (cached !== undefined) return cached;

    // Get latest videos and check if any are live
    const videos = await this.getLatestVideos(5);
    const liveVideo = videos.find((v) => v.isLive || v.isUpcoming);

    if (liveVideo) {
      const result = {
        isLive: liveVideo.isLive,
        isUpcoming: liveVideo.isUpcoming,
        videoId: liveVideo.id,
        title: liveVideo.title,
        thumbnail: liveVideo.thumbnail,
        scheduledStart: liveVideo.scheduledStart,
        actualStart: liveVideo.actualStart,
      };
      setCache(cacheKey, result);
      return result;
    }

    setCache(cacheKey, null);
    return null;
  }

  /**
   * Format video data
   * @param {object} video - Raw video data from API
   * @returns {object} - Formatted video
   */
  formatVideo(video) {
    const liveDetails = video.liveStreamingDetails;
    const isLive = liveDetails?.actualStartTime && !liveDetails?.actualEndTime;
    const isUpcoming = liveDetails?.scheduledStartTime && !liveDetails?.actualStartTime;

    return {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails?.medium?.url,
      thumbnailHigh: video.snippet.thumbnails?.high?.url,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      duration: this.parseDuration(video.contentDetails?.duration),
      durationFormatted: this.formatDuration(video.contentDetails?.duration),
      viewCount: parseInt(video.statistics?.viewCount, 10) || 0,
      likeCount: parseInt(video.statistics?.likeCount, 10) || 0,
      commentCount: parseInt(video.statistics?.commentCount, 10) || 0,
      isLive,
      isUpcoming,
      scheduledStart: liveDetails?.scheduledStartTime,
      actualStart: liveDetails?.actualStartTime,
      concurrentViewers: liveDetails?.concurrentViewers
        ? parseInt(liveDetails.concurrentViewers, 10)
        : null,
      url: `https://www.youtube.com/watch?v=${video.id}`,
    };
  }

  /**
   * Parse ISO 8601 duration to seconds
   * @param {string} duration - ISO 8601 duration (PT1H2M3S)
   * @returns {number} - Duration in seconds
   */
  parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1], 10) || 0;
    const minutes = parseInt(match[2], 10) || 0;
    const seconds = parseInt(match[3], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration for display
   * @param {string} duration - ISO 8601 duration
   * @returns {string} - Formatted duration (1:02:03 or 2:03)
   */
  formatDuration(duration) {
    const totalSeconds = this.parseDuration(duration);
    if (totalSeconds === 0) return "0:00";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    cache.clear();
  }
}
