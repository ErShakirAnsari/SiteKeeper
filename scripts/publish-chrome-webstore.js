#!/usr/bin/env node
/**
 * Uploads a packaged .zip to the Chrome Web Store and publishes it, using a
 * Google Cloud Service Account (Chrome Web Store API v2) — no personal OAuth
 * consent flow, no refresh token, no 7-day expiry.
 *
 * Setup (see README.md for full steps):
 *   1. Enable the "Chrome Web Store API" on a Google Cloud project.
 *   2. Create a service account in that project (no roles/permissions needed).
 *   3. In the Chrome Web Store Developer Dashboard → Account, add the service
 *      account's email so it can manage items under your publisher account.
 *   4. Create a JSON key for the service account and store its full contents
 *      as the CHROME_SERVICE_ACCOUNT_KEY secret.
 *
 * Required env vars:
 *   CHROME_SERVICE_ACCOUNT_KEY - full JSON key file contents for the service account
 *   CHROME_PUBLISHER_ID        - your publisher ID (Developer Dashboard → Publisher → Settings)
 *   EXTENSION_ID                - the item ID to upload/publish
 *
 * Usage: node publish-chrome-webstore.js path/to/package.zip
 */

const fs = require("fs");
const crypto = require("crypto");

const { CHROME_SERVICE_ACCOUNT_KEY, CHROME_PUBLISHER_ID, EXTENSION_ID } = process.env;
const zipPath = process.argv[2];

function requireEnv() {
  const missing = ["CHROME_SERVICE_ACCOUNT_KEY", "CHROME_PUBLISHER_ID", "EXTENSION_ID"].filter(
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

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Build and sign a JWT asserting this service account's identity, then trade
// it for a short-lived OAuth access token (the standard Google service
// account "self-signed JWT" flow — no google-auth-library dependency needed).
function createSignedJwt(serviceAccount, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key);
  const signatureB64Url = signature
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${unsigned}.${signatureB64Url}`;
}

async function getAccessToken(serviceAccount) {
  const assertion = createSignedJwt(serviceAccount, "https://www.googleapis.com/auth/chromewebstore");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function uploadPackage(accessToken) {
  const fileBuffer = fs.readFileSync(zipPath);
  const res = await fetch(
    `https://chromewebstore.googleapis.com/upload/v2/publishers/${CHROME_PUBLISHER_ID}/items/${EXTENSION_ID}:upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: fileBuffer,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  console.log("Upload state:", data.uploadState || JSON.stringify(data));
  return data;
}

async function publishPackage(accessToken) {
  const res = await fetch(
    `https://chromewebstore.googleapis.com/v2/publishers/${CHROME_PUBLISHER_ID}/items/${EXTENSION_ID}:publish`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Publish failed: ${JSON.stringify(data)}`);
  console.log("Publish result:", JSON.stringify(data));
  return data;
}

(async () => {
  requireEnv();
  try {
    const serviceAccount = JSON.parse(CHROME_SERVICE_ACCOUNT_KEY);
    const accessToken = await getAccessToken(serviceAccount);
    await uploadPackage(accessToken);
    await publishPackage(accessToken);
    console.log(`Published ${zipPath} to item ${EXTENSION_ID} (publisher ${CHROME_PUBLISHER_ID}).`);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();
