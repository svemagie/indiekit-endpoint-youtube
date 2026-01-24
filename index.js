import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dashboardController } from "./lib/controllers/dashboard.js";
import { videosController } from "./lib/controllers/videos.js";
import { channelController } from "./lib/controllers/channel.js";
import { liveController } from "./lib/controllers/live.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const protectedRouter = express.Router();
const publicRouter = express.Router();

const defaults = {
  mountPath: "/youtube",
  apiKey: process.env.YOUTUBE_API_KEY,
  // Single channel (backward compatible)
  channelId: process.env.YOUTUBE_CHANNEL_ID,
  channelHandle: process.env.YOUTUBE_CHANNEL_HANDLE,
  // Multiple channels support: array of {id, handle, name}
  channels: null,
  cacheTtl: 300_000, // 5 minutes
  liveCacheTtl: 60_000, // 1 minute for live status
  limits: {
    videos: 10,
  },
};

export default class YouTubeEndpoint {
  name = "YouTube channel endpoint";

  constructor(options = {}) {
    this.options = { ...defaults, ...options };
    this.mountPath = this.options.mountPath;
  }

  get environment() {
    return ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID", "YOUTUBE_CHANNEL_HANDLE"];
  }

  get localesDirectory() {
    return path.join(__dirname, "locales");
  }

  get navigationItems() {
    return {
      href: this.options.mountPath,
      text: "youtube.title",
    };
  }

  get shortcutItems() {
    return {
      url: this.options.mountPath,
      name: "youtube.videos",
      iconName: "syndicate",
    };
  }

  /**
   * Protected routes (require authentication)
   * Admin dashboard
   */
  get routes() {
    protectedRouter.get("/", dashboardController.get);
    protectedRouter.post("/refresh", dashboardController.refresh);

    return protectedRouter;
  }

  /**
   * Public routes (no authentication required)
   * JSON API endpoints for Eleventy frontend
   */
  get routesPublic() {
    publicRouter.get("/api/videos", videosController.api);
    publicRouter.get("/api/channel", channelController.api);
    publicRouter.get("/api/live", liveController.api);

    return publicRouter;
  }

  init(Indiekit) {
    Indiekit.addEndpoint(this);

    // Store YouTube config in application for controller access
    Indiekit.config.application.youtubeConfig = this.options;
    Indiekit.config.application.youtubeEndpoint = this.mountPath;
  }
}
