import { YouTubeClient } from "../youtube-client.js";
import { getChannelsFromConfig } from "./channel.js";

/**
 * Videos controller
 */
export const videosController = {
  /**
   * Get latest videos (JSON API)
   * Returns videos from all configured channels
   * @type {import("express").RequestHandler}
   */
  async api(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const { apiKey, cacheTtl, limits } = youtubeConfig;
      const channelConfigs = getChannelsFromConfig(youtubeConfig);

      if (!apiKey || channelConfigs.length === 0) {
        return response.status(500).json({ error: "Invalid configuration" });
      }

      const maxResults = Math.min(
        parseInt(request.query.limit, 10) || limits?.videos || 10,
        50
      );

      // Fetch videos from all channels in parallel
      const videosPromises = channelConfigs.map(async (channelConfig) => {
        const client = new YouTubeClient({
          apiKey,
          channelId: channelConfig.id,
          channelHandle: channelConfig.handle,
          cacheTtl,
        });

        try {
          const videos = await client.getLatestVideos(maxResults);
          // Add channel info to each video
          return videos.map((video) => ({
            ...video,
            channelConfigName: channelConfig.name,
          }));
        } catch (error) {
          console.error(
            `[YouTube] Failed to fetch videos for ${channelConfig.name || channelConfig.handle}:`,
            error.message
          );
          return [];
        }
      });

      const videosArrays = await Promise.all(videosPromises);

      // For single channel, return flat array (backward compatible)
      if (channelConfigs.length === 1) {
        const videos = videosArrays[0] || [];
        response.json({
          videos,
          count: videos.length,
          cached: true,
        });
      } else {
        // For multiple channels, return grouped by channel
        const videosByChannel = {};
        channelConfigs.forEach((config, index) => {
          videosByChannel[config.name || config.handle] = videosArrays[index] || [];
        });

        // Also provide flat array sorted by date
        const allVideos = videosArrays
          .flat()
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
          .slice(0, maxResults);

        response.json({
          videos: allVideos, // Backward compat: flat array
          videosByChannel,
          count: allVideos.length,
          cached: true,
        });
      }
    } catch (error) {
      console.error("[YouTube] Videos API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
