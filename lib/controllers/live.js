import { YouTubeClient } from "../youtube-client.js";
import { getChannelsFromConfig } from "./channel.js";

/**
 * Live status controller
 */
export const liveController = {
  /**
   * Get live status (JSON API)
   * Uses efficient method (checking recent videos) by default
   * Use ?full=true for full search (costs 100 quota units)
   * Returns live status for all configured channels
   * @type {import("express").RequestHandler}
   */
  async api(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const { apiKey, liveCacheTtl } = youtubeConfig;
      const channelConfigs = getChannelsFromConfig(youtubeConfig);

      if (!apiKey || channelConfigs.length === 0) {
        return response.status(500).json({ error: "Invalid configuration" });
      }

      const useFullSearch = request.query.full === "true";

      // Fetch live status from all channels in parallel
      const livePromises = channelConfigs.map(async (channelConfig) => {
        const client = new YouTubeClient({
          apiKey,
          channelId: channelConfig.id,
          channelHandle: channelConfig.handle,
          liveCacheTtl,
        });

        try {
          const liveStatus = useFullSearch
            ? await client.getLiveStatus()
            : await client.getLiveStatusEfficient();

          if (liveStatus) {
            return {
              channelConfigName: channelConfig.name,
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
            };
          }
          return {
            channelConfigName: channelConfig.name,
            isLive: false,
            isUpcoming: false,
            stream: null,
          };
        } catch (error) {
          console.error(
            `[YouTube] Failed to fetch live status for ${channelConfig.name || channelConfig.handle}:`,
            error.message
          );
          return {
            channelConfigName: channelConfig.name,
            isLive: false,
            isUpcoming: false,
            stream: null,
          };
        }
      });

      const liveStatuses = await Promise.all(livePromises);

      // For single channel, return flat response (backward compatible)
      if (channelConfigs.length === 1) {
        const status = liveStatuses[0];
        response.json({
          isLive: status.isLive,
          isUpcoming: status.isUpcoming,
          stream: status.stream,
          cached: true,
        });
      } else {
        // For multiple channels, find any that are live
        const anyLive = liveStatuses.find((s) => s.isLive);
        const anyUpcoming = liveStatuses.find((s) => s.isUpcoming && !s.isLive);

        response.json({
          // Backward compat: primary live status (prefer live over upcoming)
          isLive: !!anyLive,
          isUpcoming: !anyLive && !!anyUpcoming,
          stream: anyLive?.stream || anyUpcoming?.stream || null,
          // Multi-channel data
          liveStatuses,
          cached: true,
        });
      }
    } catch (error) {
      console.error("[YouTube] Live API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
