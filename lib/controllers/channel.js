import { YouTubeClient } from "../youtube-client.js";

/**
 * Channel controller
 */
export const channelController = {
  /**
   * Get channel info (JSON API)
   * @type {import("express").RequestHandler}
   */
  async api(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const { apiKey, channelId, channelHandle, cacheTtl } = youtubeConfig;

      if (!apiKey || (!channelId && !channelHandle)) {
        return response.status(500).json({ error: "Invalid configuration" });
      }

      const client = new YouTubeClient({
        apiKey,
        channelId,
        channelHandle,
        cacheTtl,
      });

      const channel = await client.getChannelInfo();

      response.json({
        channel,
        cached: true,
      });
    } catch (error) {
      console.error("[YouTube] Channel API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
