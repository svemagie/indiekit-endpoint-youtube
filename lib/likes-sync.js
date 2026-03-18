/**
 * YouTube Likes → Indiekit "like" posts sync
 *
 * On first run after connecting, snapshots all current liked video IDs
 * as "known" without creating posts. Subsequent syncs only create posts
 * for newly liked videos (ones not in the known set and not already
 * in the posts collection).
 */

import { YouTubeClient } from "./youtube-client.js";
import { getValidAccessToken } from "./oauth.js";

/**
 * Generate a deterministic slug from a YouTube video ID.
 * @param {string} videoId
 * @returns {string}
 */
function slugFromVideoId(videoId) {
  return `yt-like-${videoId}`;
}

/**
 * Fetch all current liked video IDs (up to maxPages) and store them
 * as the baseline. No posts are created.
 * @returns {Promise<number>} number of IDs snapshotted
 */
async function snapshotExistingLikes(db, client, accessToken, maxPages) {
  const collection = db.collection("youtubeLikesSeen");
  await collection.createIndex({ videoId: 1 }, { unique: true });

  let pageToken;
  let count = 0;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.getLikedVideos(accessToken, 50, pageToken);

    const ops = result.videos.map((v) => ({
      updateOne: {
        filter: { videoId: v.id },
        update: { $setOnInsert: { videoId: v.id, seenAt: new Date() } },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await collection.bulkWrite(ops, { ordered: false });
      count += ops.length;
    }

    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  // Mark that the baseline snapshot is done
  await db.collection("youtubeMeta").updateOne(
    { key: "likes_baseline" },
    { $set: { key: "likes_baseline", completedAt: new Date(), count } },
    { upsert: true },
  );

  return count;
}

/**
 * Prepare template properties by stripping internal mp-* and post-type keys,
 * matching what Indiekit's micropub endpoint does before calling postTemplate.
 * @param {object} properties
 * @returns {object}
 */
function getTemplateProperties(properties) {
  const templateProperties = structuredClone(properties);
  const preserveMpProperties = ["mp-syndicate-to"];

  for (const key in templateProperties) {
    if (key.startsWith("mp-") && !preserveMpProperties.includes(key)) {
      delete templateProperties[key];
    }
    if (key === "post-type") {
      delete templateProperties[key];
    }
  }

  return templateProperties;
}

/**
 * Sync liked videos into the Indiekit posts collection.
 *
 * First-run behaviour: snapshots all existing likes as "seen" without
 * creating posts. Only likes that appear after the baseline are turned
 * into posts.
 *
 * @param {object} opts
 * @param {import("mongodb").Db} opts.db
 * @param {object} opts.youtubeConfig - endpoint options
 * @param {object} opts.publication - Indiekit publication (with store, postTemplate, storeMessageTemplate)
 * @param {import("mongodb").Collection} [opts.postsCollection]
 * @param {number} [opts.maxPages=3] - max pages to fetch (50 likes/page)
 * @returns {Promise<{synced: number, skipped: number, total: number, baselined?: number, error?: string}>}
 */
export async function syncLikes({ db, youtubeConfig, publication, postsCollection, maxPages = 3 }) {
  const { apiKey, oauth } = youtubeConfig;
  if (!oauth?.clientId || !oauth?.clientSecret) {
    return { synced: 0, skipped: 0, total: 0, error: "OAuth not configured" };
  }

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

  // --- First-run: snapshot existing likes, create zero posts ---
  const baseline = await db.collection("youtubeMeta").findOne({ key: "likes_baseline" });
  if (!baseline) {
    console.log("[YouTube] First sync — snapshotting existing likes (no posts will be created)");
    const count = await snapshotExistingLikes(db, client, accessToken, maxPages);
    console.log(`[YouTube] Baselined ${count} existing liked videos`);
    return { synced: 0, skipped: 0, total: count, baselined: count };
  }

  // --- Normal sync: only create posts for new likes ---
  const seenCollection = db.collection("youtubeLikesSeen");
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
      const videoId = video.id;

      // Already seen? Skip.
      const seen = await seenCollection.findOne({ videoId });
      if (seen) {
        skipped++;
        continue;
      }

      // Mark as seen immediately (even if post insert fails, don't retry)
      await seenCollection.updateOne(
        { videoId },
        { $setOnInsert: { videoId, seenAt: new Date() } },
        { upsert: true },
      );

      const slug = slugFromVideoId(videoId);
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Also skip if a post already exists (belt-and-suspenders)
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

      const postPath = likePostType?.post?.path
        ? likePostType.post.path.replace("{slug}", slug)
        : `content/likes/${slug}.md`;

      const postUrl = likePostType?.post?.url
        ? likePostType.post.url.replace("{slug}", slug)
        : `${publicationUrl}/likes/${slug}/`;

      const postProperties = {
        "post-type": "like",
        "mp-slug": slug,
        "like-of": videoUrl,
        name: `${video.title} - ${video.channelTitle}`,
        content: {
          text: `${video.title} - ${video.channelTitle}`,
          html: `<a href="${videoUrl}">${escapeHtml(video.title)}</a> - ${escapeHtml(video.channelTitle)}`,
        },
        published: new Date().toISOString(),
        url: postUrl,
        visibility: "public",
        "post-status": "draft",
        "youtube-video-id": videoId,
        "youtube-channel": video.channelTitle,
        "youtube-thumbnail": video.thumbnail || "",
      };

      // Write markdown file to the store (e.g. GitHub)
      if (publication?.postTemplate && publication?.store) {
        try {
          const templateProperties = getTemplateProperties(postProperties);
          const content = await publication.postTemplate(templateProperties);
          const message = publication.storeMessageTemplate
            ? publication.storeMessageTemplate({
                action: "create",
                result: "created",
                fileType: "post",
                postType: "like",
              })
            : `Create like post for ${videoId}`;

          await publication.store.createFile(postPath, content, { message });
        } catch (storeError) {
          console.error(`[YouTube] Failed to write ${postPath} to store:`, storeError.message);
          // Continue — still insert into MongoDB so it isn't retried
        }
      }

      // Insert into MongoDB posts collection
      const postDoc = { path: postPath, properties: postProperties };
      if (postsCollection) {
        await postsCollection.insertOne(postDoc);
      }
      synced++;
    }

    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

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
  const interval = options.likes?.syncInterval || 3_600_000;

  async function run() {
    const db = Indiekit.database;
    if (!db) return;

    const postsCollection = Indiekit.config?.application?.collections?.get("posts");
    const publication = Indiekit.publication || Indiekit.config?.publication;

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
      if (result.baselined) {
        console.log(`[YouTube] Baseline complete: ${result.baselined} existing likes recorded`);
      }
    } catch (err) {
      console.error("[YouTube] Likes sync error:", err.message);
    }
  }

  setTimeout(() => {
    run().catch(() => {});
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
