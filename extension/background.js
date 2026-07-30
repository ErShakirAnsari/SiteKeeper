import { hashPassword, verifyPassword } from "./crypto.js";

// ---------------------------------------------------------------------------
// Storage layout
// ---------------------------------------------------------------------------
// chrome.storage.sync   (synced to the user's Google account)
//   blockedSites : [{ id, hostname, addedAt }]
//   passwordHash : { salt, hash, iterations }   (never the plaintext password)
//
// chrome.storage.session (cleared automatically on browser restart, per-device)
//   tabUnlocks   : { [tabId]: [siteId, siteId, ...] }
//
// chrome.storage.local  (per-device, survives restart, NOT synced)
//   timedUnlocks : { [siteId]: expiryEpochMs }
// ---------------------------------------------------------------------------

const BLOCKED_PAGE = "blocked.html";

function genId() {
  return crypto.randomUUID();
}

function normalizeHostname(input) {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-zA-Z]+:\/\//.test(value)) {
    value = "https://" + value;
  }
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function getSyncData() {
  const data = await chrome.storage.sync.get(["blockedSites", "passwordHash"]);
  return {
    blockedSites: data.blockedSites || [],
    passwordHash: data.passwordHash || null,
  };
}

async function getTabUnlocks() {
  const data = await chrome.storage.session.get(["tabUnlocks"]);
  return data.tabUnlocks || {};
}

async function getTimedUnlocks() {
  const data = await chrome.storage.local.get(["timedUnlocks"]);
  return data.timedUnlocks || {};
}

function findMatchingSite(hostname, blockedSites) {
  return blockedSites.find(
    (site) =>
      hostname === site.hostname || hostname.endsWith("." + site.hostname)
  );
}

async function isSiteUnlocked(siteId, tabId) {
  const timedUnlocks = await getTimedUnlocks();
  const expiry = timedUnlocks[siteId];
  if (expiry && expiry > Date.now()) return { unlocked: true, mode: "timed", expiry };
  if (expiry && expiry <= Date.now()) {
    delete timedUnlocks[siteId];
    chrome.storage.local.set({ timedUnlocks });
  }

  if (tabId != null) {
    const tabUnlocks = await getTabUnlocks();
    if (tabUnlocks[tabId] && tabUnlocks[tabId].includes(siteId)) {
      return { unlocked: true, mode: "tab" };
    }
  }
  return { unlocked: false };
}

// ---------------------------------------------------------------------------
// Navigation interception
// ---------------------------------------------------------------------------

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // main frame only
  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }
  if (!/^https?:$/.test(url.protocol)) return;

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const { blockedSites } = await getSyncData();
  const site = findMatchingSite(hostname, blockedSites);
  if (!site) return;

  const status = await isSiteUnlocked(site.id, details.tabId);
  if (status.unlocked) return;

  const redirectUrl =
    chrome.runtime.getURL(BLOCKED_PAGE) +
    `?site=${encodeURIComponent(site.id)}` +
    `&host=${encodeURIComponent(site.hostname)}` +
    `&url=${encodeURIComponent(details.url)}`;

  chrome.tabs.update(details.tabId, { url: redirectUrl });
});

// Clean up per-tab unlocks when a tab closes ("until tab closes" behavior).
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabUnlocks = await getTabUnlocks();
  if (tabUnlocks[tabId]) {
    delete tabUnlocks[tabId];
    chrome.storage.session.set({ tabUnlocks });
  }
});

// Open the settings page on first install so the user sets a master password.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

// ---------------------------------------------------------------------------
// Message API used by popup.js / options.js / blocked.js
// ---------------------------------------------------------------------------

async function buildStateForDisplay() {
  const { blockedSites, passwordHash } = await getSyncData();
  const tabUnlocks = await getTabUnlocks();
  const timedUnlocks = await getTimedUnlocks();
  const now = Date.now();

  const sites = blockedSites.map((site) => {
    const timedExpiry = timedUnlocks[site.id];
    const timedActive = timedExpiry && timedExpiry > now;
    const tabActiveIn = Object.entries(tabUnlocks)
      .filter(([, ids]) => ids.includes(site.id))
      .map(([tabId]) => Number(tabId));

    let status = "blocked";
    let remainingMs = null;
    if (timedActive) {
      status = "unlocked-timed";
      remainingMs = timedExpiry - now;
    } else if (tabActiveIn.length > 0) {
      status = "unlocked-tab";
    }
    return { ...site, status, remainingMs };
  });

  return { sites, hasPassword: !!passwordHash };
}

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case "GET_STATE":
      return buildStateForDisplay();

    case "ADD_SITE": {
      const hostname = normalizeHostname(msg.input);
      if (!hostname) return { error: "That doesn't look like a valid website." };
      const { blockedSites } = await getSyncData();
      if (blockedSites.some((s) => s.hostname === hostname)) {
        return { error: `${hostname} is already blocked.` };
      }
      blockedSites.push({ id: genId(), hostname, addedAt: Date.now() });
      await chrome.storage.sync.set({ blockedSites });
      return buildStateForDisplay();
    }

    case "REMOVE_SITE": {
      const { blockedSites, passwordHash } = await getSyncData();
      if (passwordHash) {
        const ok = await verifyPassword(msg.password || "", passwordHash);
        if (!ok) return { error: "Incorrect master password." };
      }
      const next = blockedSites.filter((s) => s.id !== msg.id);
      await chrome.storage.sync.set({ blockedSites: next });
      // Clean up any unlock state tied to this site id.
      const timedUnlocks = await getTimedUnlocks();
      if (timedUnlocks[msg.id]) {
        delete timedUnlocks[msg.id];
        await chrome.storage.local.set({ timedUnlocks });
      }
      return buildStateForDisplay();
    }

    case "SET_PASSWORD": {
      const { passwordHash } = await getSyncData();
      if (passwordHash) {
        const ok = await verifyPassword(msg.currentPassword || "", passwordHash);
        if (!ok) return { error: "Current password is incorrect." };
      }
      if (!msg.newPassword || msg.newPassword.length < 6) {
        return { error: "New password must be at least 6 characters." };
      }
      const record = await hashPassword(msg.newPassword);
      await chrome.storage.sync.set({ passwordHash: record });
      return { success: true };
    }

    case "UNLOCK_SITE": {
      const { blockedSites, passwordHash } = await getSyncData();
      const site = blockedSites.find((s) => s.id === msg.id);
      if (!site) return { error: "That site is no longer in your list." };
      if (!passwordHash) return { error: "No master password is set yet." };
      const ok = await verifyPassword(msg.password || "", passwordHash);
      if (!ok) return { error: "Incorrect master password." };

      if (msg.mode === "timed") {
        const minutes = Number(msg.minutes) || 15;
        const timedUnlocks = await getTimedUnlocks();
        timedUnlocks[site.id] = Date.now() + minutes * 60 * 1000;
        await chrome.storage.local.set({ timedUnlocks });
      } else {
        const tabUnlocks = await getTabUnlocks();
        const tabId = msg.tabId ?? sender?.tab?.id;
        if (tabId == null) return { error: "Could not determine the current tab." };
        tabUnlocks[tabId] = [...(tabUnlocks[tabId] || []), site.id];
        await chrome.storage.session.set({ tabUnlocks });
      }
      return { success: true, redirectTo: msg.originalUrl || null };
    }

    default:
      return { error: "Unknown message type." };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // keep the message channel open for the async response
});
