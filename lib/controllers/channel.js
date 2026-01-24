import { YouTubeClient } from "../youtube-client.js";

/**
 * Get normalized channels array from config
 * Supports both single channel (backward compat) and multiple channels
 */
function getChannelsFromConfig(youtubeConfig) {
  const { channelId, channelHandle, channels } = youtubeConfig;

  // If channels array is provided, use it
  if (channels && Array.isArray(channels) && channels.length > 0) {
    return channels;
  }

  // Fallback to single channel config (backward compatible)
  if (channelId || channelHandle) {
    return [{ id: channelId, handle: channelHandle, name: "Primary" }];
  }

  return [];
}

/**
 * Channel controller
 */
export const channelController = {
  /**
   * Get channel info (JSON API)
   * Returns array of channels if multiple configured
   * @type {import("express").RequestHandler}
   */
  async api(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;

      if (!youtubeConfig) {
        return response.status(500).json({ error: "Not configured" });
      }

      const { apiKey, cacheTtl } = youtubeConfig;
      const channelConfigs = getChannelsFromConfig(youtubeConfig);

      if (!apiKey || channelConfigs.length === 0) {
        return response.status(500).json({ error: "Invalid configuration" });
      }

      // Fetch all channels in parallel
      const channelPromises = channelConfigs.map(async (channelConfig) => {
        const client = new YouTubeClient({
          apiKey,
          channelId: channelConfig.id,
          channelHandle: channelConfig.handle,
          cacheTtl,
        });

        try {
          const channel = await client.getChannelInfo();
          return {
            ...channel,
            configName: channelConfig.name,
          };
        } catch (error) {
          console.error(
            `[YouTube] Failed to fetch channel ${channelConfig.name || channelConfig.handle}:`,
            error.message
          );
          return null;
        }
      });

      const channelsData = await Promise.all(channelPromises);
      const channels = channelsData.filter(Boolean);

      // Return single channel for backward compatibility when only one configured
      if (channelConfigs.length === 1) {
        response.json({
          channel: channels[0] || null,
          cached: true,
        });
      } else {
        response.json({
          channels,
          channel: channels[0] || null, // Primary channel for backward compat
          cached: true,
        });
      }
    } catch (error) {
      console.error("[YouTube] Channel API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};

export { getChannelsFromConfig };
