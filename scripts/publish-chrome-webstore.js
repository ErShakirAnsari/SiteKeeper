#!/usr/bin/env node
/**
 * Uploads a packaged .zip to the Chrome Web Store and publishes it.
 *
 * Required env vars:
 *   CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN  - OAuth credentials for a
 *     Google Cloud project with the Chrome Web Store API enabled
 *   EXTENSION_ID                             - the target item ID in the
 *     developer dashboard
 *
 * Usage: node publish-chrome-webstore.js path/to/package.zip
 */

const fs = require("fs");

const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, EXTENSION_ID } = process.env;
const zipPath = process.argv[2];

function requireEnv() {
  const missing = ["CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN", "EXTENSION_ID"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (!zipPath || !fs.existsSync(zipPath)) {
    console.error(`Package not found: ${zipPath}`);
    process.exit(1);
  }
}

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function uploadPackage(accessToken) {
  const fileBuffer = fs.readFileSync(zipPath);
  const res = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}?uploadType=media`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-api-version": "2",
      },
      body: fileBuffer,
    }
  );
  const data = await res.json();
  if (!res.ok || data.uploadState === "FAILURE") {
    throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  }
  console.log("Upload state:", data.uploadState);
  return data;
}

async function publishPackage(accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-api-version": "2",
        "Content-Length": "0",
      },
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Publish failed: ${JSON.stringify(data)}`);
  }
  console.log("Publish status:", data.status);
  return data;
}

(async () => {
  requireEnv();
  try {
    const accessToken = await getAccessToken();
    await uploadPackage(accessToken);
    await publishPackage(accessToken);
    console.log(`Published ${zipPath} to Chrome Web Store item ${EXTENSION_ID}.`);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
