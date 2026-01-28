import { YouTubeClient } from "../youtube-client.js";

/**
 * Get all channels from config (supports both single and multi-channel modes)
 * @param {object} config - YouTube configuration
 * @returns {Array<{id?: string, handle?: string, name?: string}>}
 */
function getAllChannels(config) {
  const { channelId, channelHandle, channels } = config;

  // Multi-channel mode
  if (channels && Array.isArray(channels) && channels.length > 0) {
    return channels.map((ch) => ({
      id: ch.id,
      handle: ch.handle,
      name: ch.name,
    }));
  }

  // Single channel mode (backward compatible)
  if (channelId || channelHandle) {
    return [{ id: channelId, handle: channelHandle }];
  }

  return [];
}

/**
 * Get primary channel from config (for backward compatibility)
 * Multi-channel mode uses first channel for dashboard
 */
function getPrimaryChannel(config) {
  const channels = getAllChannels(config);
  return channels.length > 0 ? channels[0] : null;
}

/**
 * Dashboard controller
 */
export const dashboardController = {
  /**
   * Render dashboard page
   * @type {import("express").RequestHandler}
   */
  async get(request, response, next) {
    try {
      const { youtubeConfig, youtubeEndpoint } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).render("youtube", {
          title: "YouTube",
          error: { message: "YouTube endpoint not configured" },
        });
      }

      const { apiKey, cacheTtl, limits } = youtubeConfig;

      if (!apiKey) {
        return response.render("youtube", {
          title: response.locals.__("youtube.title"),
          error: { message: response.locals.__("youtube.error.noApiKey") },
        });
      }

      const allChannels = getAllChannels(youtubeConfig);

      if (allChannels.length === 0) {
        return response.render("youtube", {
          title: response.locals.__("youtube.title"),
          error: { message: response.locals.__("youtube.error.noChannel") },
        });
      }

      // Fetch data for all configured channels
      const channelsData = [];

      for (const channelConfig of allChannels) {
        const client = new YouTubeClient({
          apiKey,
          channelId: channelConfig.id,
          channelHandle: channelConfig.handle,
          cacheTtl,
        });

        try {
          const [channel, videos, liveStatus] = await Promise.all([
            client.getChannelInfo(),
            client.getLatestVideos(limits?.videos || 6),
            client.getLiveStatusEfficient(),
          ]);

          channelsData.push({
            name: channelConfig.name || channel.title,
            channel,
            videos: videos.slice(0, limits?.videos || 6),
            liveStatus,
            isLive: liveStatus?.isLive || false,
            isUpcoming: liveStatus?.isUpcoming || false,
          });
        } catch (apiError) {
          console.error(
            `[YouTube] API error for channel ${channelConfig.name || channelConfig.id || channelConfig.handle}:`,
            apiError.message,
          );
          // Continue with other channels even if one fails
          channelsData.push({
            name:
              channelConfig.name || channelConfig.id || channelConfig.handle,
            error: apiError.message,
          });
        }
      }

      // Determine public frontend URL
      const publicUrl = youtubeEndpoint
        ? youtubeEndpoint.replace(/api$/, "")
        : "/youtube";

      // For backward compatibility, also expose first channel's data at top level
      const primaryData = channelsData[0] || {};

      response.render("youtube", {
        title: response.locals.__("youtube.title"),
        // Multi-channel data
        channelsData,
        isMultiChannel: allChannels.length > 1,
        // Backward compatible single-channel data (first channel)
        channel: primaryData.channel,
        videos: primaryData.videos,
        liveStatus: primaryData.liveStatus,
        isLive: primaryData.isLive || false,
        isUpcoming: primaryData.isUpcoming || false,
        publicUrl,
        mountPath: request.baseUrl,
      });
    } catch (error) {
      console.error("[YouTube] Dashboard error:", error);
      next(error);
    }
  },

  /**
   * Trigger manual cache refresh
   * @type {import("express").RequestHandler}
   */
  async refresh(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const primaryChannel = getPrimaryChannel(youtubeConfig);

      if (!primaryChannel) {
        return response.status(500).json({ error: "No channel configured" });
      }

      const client = new YouTubeClient({
        apiKey: youtubeConfig.apiKey,
        channelId: primaryChannel.id,
        channelHandle: primaryChannel.handle,
      });

      // Clear cache and refetch
      client.clearCache();
      const [channel, videos] = await Promise.all([
        client.getChannelInfo(),
        client.getLatestVideos(youtubeConfig.limits?.videos || 10),
      ]);

      response.json({
        success: true,
        channel: channel.title,
        videoCount: videos.length,
        message: `Refreshed ${videos.length} videos from ${channel.title}`,
      });
    } catch (error) {
      console.error("[YouTube] Refresh error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
