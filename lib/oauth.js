/**
 * YouTube OAuth 2.0 helpers
 *
 * Uses Google's OAuth 2.0 endpoints to obtain a user token with
 * `youtube.readonly` scope so we can read the authenticated user's
 * liked‑videos list.
 *
 * Tokens (access + refresh) are persisted in a MongoDB collection
 * (`youtubeMeta`) so the user only has to authorize once.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/youtube.readonly";

/**
 * Build the Google OAuth authorization URL.
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {string} opts.redirectUri
 * @param {string} [opts.state]
 * @returns {string}
 */
export function buildAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Exchange an authorization code for tokens.
 * @param {object} opts
 * @param {string} opts.code
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @param {string} opts.redirectUri
 * @returns {Promise<{access_token: string, refresh_token?: string, expires_in: number}>}
 */
export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description || response.statusText}`);
  }

  return response.json();
}

/**
 * Refresh an access token using a refresh token.
 * @param {object} opts
 * @param {string} opts.refreshToken
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @returns {Promise<{access_token: string, expires_in: number}>}
 */
export async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Token refresh failed: ${err.error_description || response.statusText}`);
  }

  return response.json();
}

/**
 * Persist tokens to MongoDB.
 * @param {import("mongodb").Db} db
 * @param {object} tokens - { access_token, refresh_token?, expires_in }
 */
export async function saveTokens(db, tokens) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  const update = {
    $set: {
      key: "oauth_tokens",
      accessToken: tokens.access_token,
      expiresAt,
      updatedAt: new Date(),
    },
  };

  // Only overwrite refresh_token when a new one is provided
  if (tokens.refresh_token) {
    update.$set.refreshToken = tokens.refresh_token;
  }

  await db.collection("youtubeMeta").updateOne(
    { key: "oauth_tokens" },
    update,
    { upsert: true },
  );
}

/**
 * Load tokens from MongoDB.
 * @param {import("mongodb").Db} db
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: Date}|null>}
 */
export async function loadTokens(db) {
  return db.collection("youtubeMeta").findOne({ key: "oauth_tokens" });
}

/**
 * Get a valid access token, refreshing if needed.
 * @param {import("mongodb").Db} db
 * @param {object} opts - { clientId, clientSecret }
 * @returns {Promise<string|null>}
 */
export async function getValidAccessToken(db, { clientId, clientSecret }) {
  const stored = await loadTokens(db);
  if (!stored?.refreshToken) return null;

  // If the access token hasn't expired yet (with 60s buffer), use it
  if (stored.accessToken && stored.expiresAt && new Date(stored.expiresAt) > new Date(Date.now() + 60_000)) {
    return stored.accessToken;
  }

  // Refresh
  const fresh = await refreshAccessToken({
    refreshToken: stored.refreshToken,
    clientId,
    clientSecret,
  });

  await saveTokens(db, fresh);
  return fresh.access_token;
}

/**
 * Delete stored tokens (disconnect).
 * @param {import("mongodb").Db} db
 */
export async function deleteTokens(db) {
  await db.collection("youtubeMeta").deleteOne({ key: "oauth_tokens" });
}
