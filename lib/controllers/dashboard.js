import { YouTubeClient } from "../youtube-client.js";

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

      const { apiKey, channelId, channelHandle, cacheTtl, limits } = youtubeConfig;

      if (!apiKey) {
        return response.render("youtube", {
          title: response.locals.__("youtube.title"),
          error: { message: response.locals.__("youtube.error.noApiKey") },
        });
      }

      if (!channelId && !channelHandle) {
        return response.render("youtube", {
          title: response.locals.__("youtube.title"),
          error: { message: response.locals.__("youtube.error.noChannel") },
        });
      }

      const client = new YouTubeClient({
        apiKey,
        channelId,
        channelHandle,
        cacheTtl,
      });

      let channel = null;
      let videos = [];
      let liveStatus = null;

      try {
        [channel, videos, liveStatus] = await Promise.all([
          client.getChannelInfo(),
          client.getLatestVideos(limits?.videos || 6),
          client.getLiveStatusEfficient(),
        ]);
      } catch (apiError) {
        console.error("[YouTube] API error:", apiError.message);
        return response.render("youtube", {
          title: response.locals.__("youtube.title"),
          error: { message: response.locals.__("youtube.error.connection") },
        });
      }

      // Determine public frontend URL
      const publicUrl = youtubeEndpoint
        ? youtubeEndpoint.replace(/api$/, "")
        : "/youtube";

      response.render("youtube", {
        title: response.locals.__("youtube.title"),
        channel,
        videos: videos.slice(0, limits?.videos || 6),
        liveStatus,
        isLive: liveStatus?.isLive || false,
        isUpcoming: liveStatus?.isUpcoming || false,
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

      const client = new YouTubeClient({
        apiKey: youtubeConfig.apiKey,
        channelId: youtubeConfig.channelId,
        channelHandle: youtubeConfig.channelHandle,
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
