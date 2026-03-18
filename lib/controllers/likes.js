/**
 * YouTube Likes controller
 *
 * Handles the OAuth flow (connect / callback / disconnect)
 * and manual sync trigger for liked videos.
 */

import {
  buildAuthUrl,
  exchangeCode,
  saveTokens,
  loadTokens,
  deleteTokens,
} from "../oauth.js";
import { syncLikes, getLastSyncStatus } from "../likes-sync.js";

export const likesController = {
  /**
   * GET /likes — dashboard showing connection status, sync info, recent likes
   */
  async get(request, response, next) {
    try {
      const { youtubeConfig } = request.app.locals.application;
      const db = request.app.locals.application.getYoutubeDb?.();

      if (!db) {
        return response.render("youtube-likes", {
          title: response.locals.__("youtube.likes.title"),
          error: "Database not available",
        });
      }

      const oauth = youtubeConfig?.oauth;
      if (!oauth?.clientId) {
        return response.render("youtube-likes", {
          title: response.locals.__("youtube.likes.title"),
          error: response.locals.__("youtube.likes.error.noOAuth"),
        });
      }

      const tokens = await loadTokens(db);
      const isConnected = Boolean(tokens?.refreshToken);
      const lastSync = await getLastSyncStatus(db);
      const baseline = await db.collection("youtubeMeta").findOne({ key: "likes_baseline" });
      const seenCount = await db.collection("youtubeLikesSeen").countDocuments();

      // Fetch recent like posts for the overview
      let recentLikes = [];
      let totalLikePosts = 0;
      const postsCollection = request.app.locals.application.collections?.get("posts");
      if (postsCollection) {
        recentLikes = await postsCollection
          .find({
            "properties.post-type": "like",
            "properties.youtube-video-id": { $exists: true },
          })
          .sort({ "properties.published": -1 })
          .limit(10)
          .toArray();

        totalLikePosts = await postsCollection.countDocuments({
          "properties.post-type": "like",
          "properties.youtube-video-id": { $exists: true },
        });
      }

      // Flash messages from query params
      const { error: qError, connected, disconnected, synced, skipped } = request.query;
      let success = null;
      let notice = null;
      if (connected) success = response.locals.__("youtube.likes.flash.connected");
      if (disconnected) notice = response.locals.__("youtube.likes.flash.disconnected");
      if (synced !== undefined) {
        const s = parseInt(synced, 10) || 0;
        const sk = parseInt(skipped, 10) || 0;
        success = response.locals.__("youtube.likes.flash.synced", { synced: s, skipped: sk });
      }

      response.render("youtube-likes", {
        title: response.locals.__("youtube.likes.title"),
        isConnected,
        lastSync,
        baseline,
        seenCount,
        recentLikes: recentLikes.map((l) => l.properties),
        totalLikePosts,
        mountPath: request.baseUrl,
        error: qError || null,
        success,
        notice,
      });
    } catch (error) {
      console.error("[YouTube] Likes page error:", error);
      next(error);
    }
  },

  /**
   * GET /likes/connect — redirect to Google OAuth
   */
  async connect(request, response) {
    const { youtubeConfig } = request.app.locals.application;
    const oauth = youtubeConfig?.oauth;

    if (!oauth?.clientId) {
      return response.status(400).json({ error: "OAuth client ID not configured" });
    }

    const redirectUri = `${request.app.locals.application.url || ""}${request.baseUrl}/likes/callback`;

    const authUrl = buildAuthUrl({
      clientId: oauth.clientId,
      redirectUri,
      state: "youtube-likes",
    });

    response.redirect(authUrl);
  },

  /**
   * GET /likes/callback — handle Google OAuth callback
   */
  async callback(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;
      const db = request.app.locals.application.getYoutubeDb?.();
      const oauth = youtubeConfig?.oauth;

      if (!db || !oauth?.clientId || !oauth?.clientSecret) {
        return response.status(500).send("OAuth not properly configured");
      }

      const { code, error } = request.query;

      if (error) {
        console.error("[YouTube] OAuth error:", error);
        return response.redirect(`${request.baseUrl}/likes?error=${encodeURIComponent(error)}`);
      }

      if (!code) {
        return response.redirect(`${request.baseUrl}/likes?error=no_code`);
      }

      const redirectUri = `${request.app.locals.application.url || ""}${request.baseUrl}/likes/callback`;

      const tokens = await exchangeCode({
        code,
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        redirectUri,
      });

      await saveTokens(db, tokens);

      console.log("[YouTube] OAuth tokens saved successfully");
      response.redirect(`${request.baseUrl}/likes?connected=1`);
    } catch (error) {
      console.error("[YouTube] OAuth callback error:", error);
      response.redirect(`${request.baseUrl}/likes?error=${encodeURIComponent(error.message)}`);
    }
  },

  /**
   * POST /likes/disconnect — revoke and delete tokens
   */
  async disconnect(request, response) {
    try {
      const db = request.app.locals.application.getYoutubeDb?.();
      if (db) {
        await deleteTokens(db);
      }
      response.redirect(`${request.baseUrl}/likes?disconnected=1`);
    } catch (error) {
      console.error("[YouTube] Disconnect error:", error);
      response.redirect(`${request.baseUrl}/likes?error=${encodeURIComponent(error.message)}`);
    }
  },

  /**
   * POST /likes/sync — trigger manual sync
   */
  async sync(request, response) {
    try {
      const { youtubeConfig } = request.app.locals.application;
      const db = request.app.locals.application.getYoutubeDb?.();

      if (!db) {
        return response.status(503).json({ error: "Database not available" });
      }

      const postsCollection = request.app.locals.application.collections?.get("posts");
      const publication = request.app.locals.publication;

      const result = await syncLikes({
        db,
        youtubeConfig,
        publication,
        postsCollection,
        maxPages: youtubeConfig.likes?.maxPages || 5,
      });

      if (request.accepts("json")) {
        return response.json(result);
      }

      if (result.error) {
        return response.redirect(`${request.baseUrl}/likes?error=${encodeURIComponent(result.error)}`);
      }

      if (result.baselined) {
        return response.redirect(`${request.baseUrl}/likes?synced=0&skipped=${result.baselined}`);
      }

      response.redirect(`${request.baseUrl}/likes?synced=${result.synced}&skipped=${result.skipped}`);
    } catch (error) {
      console.error("[YouTube] Manual sync error:", error);
      if (request.accepts("json")) {
        return response.status(500).json({ error: error.message });
      }
      response.redirect(`${request.baseUrl}/likes?error=${encodeURIComponent(error.message)}`);
    }
  },

  /**
   * GET /api/likes — public JSON API for synced likes
   */
  async api(request, response) {
    try {
      const postsCollection = request.app.locals.application.collections?.get("posts");

      if (!postsCollection) {
        return response.status(503).json({ error: "Database not available" });
      }

      const limit = Math.min(parseInt(request.query.limit, 10) || 20, 100);
      const offset = parseInt(request.query.offset, 10) || 0;

      const likes = await postsCollection
        .find({ "properties.post-type": "like", "properties.youtube-video-id": { $exists: true } })
        .sort({ "properties.published": -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      const total = await postsCollection.countDocuments({
        "properties.post-type": "like",
        "properties.youtube-video-id": { $exists: true },
      });

      response.json({
        likes: likes.map((l) => l.properties),
        count: likes.length,
        total,
        offset,
      });
    } catch (error) {
      console.error("[YouTube] Likes API error:", error);
      response.status(500).json({ error: error.message });
    }
  },
};
