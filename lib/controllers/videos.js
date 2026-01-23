import { YouTubeClient } from "../youtube-client.js";

/**
 * Videos controller
 */
export const videosController = {
  /**
   * Get latest videos (JSON API)
   * @type {import("express").RequestHandler}
   */
  async api(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const { apiKey, channelId, channelHandle, cacheTtl, limits } = youtubeConfig;

      if (!apiKey || (!channelId && !channelHandle)) {
        return response.status(500).json({ error: "Invalid configuration" });
      }

      const client = new YouTubeClient({
        apiKey,
        channelId,
        channelHandle,
        cacheTtl,
      });

      const maxResults = Math.min(
        parseInt(request.query.limit, 10) || limits?.videos || 10,
        50
      );

      const videos = await client.getLatestVideos(maxResults);

      response.json({
        videos,
        count: videos.length,
        cached: true,
      });
    } catch (error) {
      console.error("[YouTube] Videos API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
