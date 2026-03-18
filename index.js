import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dashboardController } from "./lib/controllers/dashboard.js";
import { videosController } from "./lib/controllers/videos.js";
import { channelController } from "./lib/controllers/channel.js";
import { liveController } from "./lib/controllers/live.js";
import { likesController } from "./lib/controllers/likes.js";
import { startLikesSync } from "./lib/likes-sync.js";

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
  // OAuth 2.0 for liked-videos sync
  oauth: {
    clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET || "",
  },
  // Likes sync settings
  likes: {
    syncInterval: 3_600_000, // 1 hour
    maxPages: 3, // 50 likes per page → up to 150 likes per sync
    autoSync: true,
  },
};

export default class YouTubeEndpoint {
  name = "YouTube channel endpoint";

  constructor(options = {}) {
    this.options = {
      ...defaults,
      ...options,
      oauth: { ...defaults.oauth, ...options.oauth },
      likes: { ...defaults.likes, ...options.likes },
    };
    this.mountPath = this.options.mountPath;
  }

  get environment() {
    return [
      "YOUTUBE_API_KEY",
      "YOUTUBE_CHANNEL_ID",
      "YOUTUBE_CHANNEL_HANDLE",
      "YOUTUBE_OAUTH_CLIENT_ID",
      "YOUTUBE_OAUTH_CLIENT_SECRET",
    ];
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
   * Admin dashboard + likes management
   */
  get routes() {
    protectedRouter.get("/", dashboardController.get);
    protectedRouter.post("/refresh", dashboardController.refresh);

    // Likes / OAuth routes (protected except callback)
    protectedRouter.get("/likes", likesController.get);
    protectedRouter.get("/likes/connect", likesController.connect);
    protectedRouter.post("/likes/disconnect", likesController.disconnect);
    protectedRouter.post("/likes/sync", likesController.sync);

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
    publicRouter.get("/api/likes", likesController.api);

    // OAuth callback must be public (Google redirects here)
    publicRouter.get("/likes/callback", likesController.callback);

    return publicRouter;
  }

  init(Indiekit) {
    Indiekit.addEndpoint(this);

    // Register MongoDB collections
    Indiekit.addCollection("youtubeMeta");

    // Store YouTube config in application for controller access
    Indiekit.config.application.youtubeConfig = this.options;
    Indiekit.config.application.youtubeEndpoint = this.mountPath;

    // Store database getter for controller access
    Indiekit.config.application.getYoutubeDb = () => Indiekit.database;

    // Start background likes sync if OAuth is configured and autoSync is on
    if (
      this.options.oauth?.clientId &&
      this.options.oauth?.clientSecret &&
      this.options.likes?.autoSync !== false &&
      Indiekit.config.application.mongodbUrl
    ) {
      startLikesSync(Indiekit, this.options);
    }
  }
}
