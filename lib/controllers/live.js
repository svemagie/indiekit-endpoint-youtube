import { YouTubeClient } from "../youtube-client.js";

/**
 * Live status controller
 */
export const liveController = {
  /**
   * Get live status (JSON API)
   * Uses efficient method (checking recent videos) by default
   * Use ?full=true for full search (costs 100 quota units)
   * @type {import("express").RequestHandler}
   */
  async api(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const { apiKey, channelId, channelHandle, liveCacheTtl } = youtubeConfig;

      if (!apiKey || (!channelId && !channelHandle)) {
        return response.status(500).json({ error: "Invalid configuration" });
      }

      const client = new YouTubeClient({
        apiKey,
        channelId,
        channelHandle,
        liveCacheTtl,
      });

      // Use full search only if explicitly requested
      const useFullSearch = request.query.full === "true";
      const liveStatus = useFullSearch
        ? await client.getLiveStatus()
        : await client.getLiveStatusEfficient();

      if (liveStatus) {
        response.json({
          isLive: liveStatus.isLive || false,
          isUpcoming: liveStatus.isUpcoming || false,
          stream: {
            videoId: liveStatus.videoId,
            title: liveStatus.title,
            thumbnail: liveStatus.thumbnail,
            url: `https://www.youtube.com/watch?v=${liveStatus.videoId}`,
            scheduledStart: liveStatus.scheduledStart,
            actualStart: liveStatus.actualStart,
          },
          cached: true,
        });
      } else {
        response.json({
          isLive: false,
          isUpcoming: false,
          stream: null,
          cached: true,
        });
      }
    } catch (error) {
      console.error("[YouTube] Live API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
