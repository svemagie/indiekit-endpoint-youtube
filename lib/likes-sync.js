/**
 * YouTube Likes → Indiekit "like" posts sync
 *
 * Fetches the authenticated user's liked videos and creates
 * corresponding "like" posts via the Micropub posts collection.
 */

import { YouTubeClient } from "./youtube-client.js";
import { getValidAccessToken } from "./oauth.js";
import crypto from "node:crypto";

/**
 * Generate a deterministic slug from a YouTube video ID.
 * @param {string} videoId
 * @returns {string}
 */
function slugFromVideoId(videoId) {
  return `yt-like-${videoId}`;
}

/**
 * Sync liked videos into the Indiekit posts collection.
 *
 * For each liked video that doesn't already have a corresponding post
 * in the database we insert a new "like" post document.
 *
 * @param {object} opts
 * @param {import("mongodb").Db} opts.db
 * @param {object} opts.youtubeConfig - endpoint options
 * @param {object} opts.publication - Indiekit publication config
 * @param {import("mongodb").Collection} [opts.postsCollection]
 * @param {number} [opts.maxPages=3] - max pages to fetch (50 likes/page)
 * @returns {Promise<{synced: number, skipped: number, total: number, error?: string}>}
 */
export async function syncLikes({ db, youtubeConfig, publication, postsCollection, maxPages = 3 }) {
  const { apiKey, oauth } = youtubeConfig;
  if (!oauth?.clientId || !oauth?.clientSecret) {
    return { synced: 0, skipped: 0, total: 0, error: "OAuth not configured" };
  }

  // Get a valid access token (auto‑refreshes if needed)
  let accessToken;
  try {
    accessToken = await getValidAccessToken(db, {
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
    });
  } catch (err) {
    return { synced: 0, skipped: 0, total: 0, error: `Token error: ${err.message}` };
  }

  if (!accessToken) {
    return { synced: 0, skipped: 0, total: 0, error: "Not authorized – connect YouTube first" };
  }

  const client = new YouTubeClient({ apiKey: apiKey || "unused", cacheTtl: 0 });

  let synced = 0;
  let skipped = 0;
  let total = 0;
  let pageToken;

  const publicationUrl = (publication?.me || "").replace(/\/+$/, "");
  const likePostType = publication?.postTypes?.like;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.getLikedVideos(accessToken, 50, pageToken);
    total = result.totalResults;

    for (const video of result.videos) {
      const slug = slugFromVideoId(video.id);
      const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;

      // Check if we already synced this like
      if (postsCollection) {
        const existing = await postsCollection.findOne({
          $or: [
            { "properties.mp-slug": slug },
            { "properties.like-of": videoUrl },
          ],
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Build the post path/url from the publication's like post type config
      const postPath = likePostType?.post?.path
        ? likePostType.post.path.replace("{slug}", slug)
        : `content/likes/${slug}.md`;

      const postUrl = likePostType?.post?.url
        ? likePostType.post.url.replace("{slug}", slug)
        : `${publicationUrl}/likes/${slug}/`;

      const postDoc = {
        path: postPath,
        properties: {
          "post-type": "like",
          "mp-slug": slug,
          "like-of": videoUrl,
          name: `Liked "${video.title}" by ${video.channelTitle}`,
          content: {
            text: `Liked "${video.title}" by ${video.channelTitle} on YouTube`,
            html: `Liked "<a href="${videoUrl}">${escapeHtml(video.title)}</a>" by ${escapeHtml(video.channelTitle)} on YouTube`,
          },
          published: video.publishedAt || new Date().toISOString(),
          url: postUrl,
          visibility: "public",
          "post-status": "published",
          "youtube-video-id": video.id,
          "youtube-channel": video.channelTitle,
          "youtube-thumbnail": video.thumbnail || "",
        },
      };

      if (postsCollection) {
        await postsCollection.insertOne(postDoc);
      }
      synced++;
    }

    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  // Update sync metadata
  await db.collection("youtubeMeta").updateOne(
    { key: "likes_sync" },
    {
      $set: {
        key: "likes_sync",
        lastSyncAt: new Date(),
        synced,
        skipped,
        total,
      },
    },
    { upsert: true },
  );

  return { synced, skipped, total };
}

/**
 * Get the last sync status.
 * @param {import("mongodb").Db} db
 * @returns {Promise<object|null>}
 */
export async function getLastSyncStatus(db) {
  return db.collection("youtubeMeta").findOne({ key: "likes_sync" });
}

/**
 * Start background periodic sync.
 * @param {object} Indiekit
 * @param {object} options - endpoint options
 */
export function startLikesSync(Indiekit, options) {
  const interval = options.likes?.syncInterval || 3_600_000; // default 1 hour

  async function run() {
    const db = Indiekit.database;
    if (!db) return;

    const postsCollection = Indiekit.config?.application?.collections?.get("posts");
    const publication = Indiekit.config?.publication;

    try {
      const result = await syncLikes({
        db,
        youtubeConfig: options,
        publication,
        postsCollection,
        maxPages: options.likes?.maxPages || 3,
      });
      if (result.synced > 0) {
        console.log(`[YouTube] Likes sync: ${result.synced} new, ${result.skipped} skipped`);
      }
    } catch (err) {
      console.error("[YouTube] Likes sync error:", err.message);
    }
  }

  // First run after a short delay to let the DB connect
  setTimeout(() => {
    run().catch(() => {});
    // Then repeat on interval
    setInterval(() => run().catch(() => {}), interval);
  }, 15_000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
