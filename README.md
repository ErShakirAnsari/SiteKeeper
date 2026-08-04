# SiteKeeper

A Chrome extension (Manifest V3) that blocks distracting or risky websites
behind a single master password. Settings sync to the user's Google account
via `chrome.storage.sync`.

## Features

- **Block any website** by domain (`Block this tab's site` or type a domain in the popup/options page).
- **Password-protected unblocking.** One master password (PBKDF2-SHA256, salted, 150k iterations) protects every blocked site. Only the salted hash is stored — never the plaintext password.
- **Unlock for the current session** — the default. A site stays open until you close that tab or restart the browser.
- **Unlock for a fixed time** — 15 / 30 / 60 minutes, after which the site re-locks automatically.
- **Remove a site from the list entirely** — requires the master password too (otherwise password protection would be pointless — anyone could just delete the entry).
- **Synced across devices.** The blocked-site list and password hash live in `chrome.storage.sync`, so Chrome syncs them to any device signed into the same Google account with sync on. Temporary unlocks are device-local and never sync.

## Project layout

```
extension/            the actual Chrome extension (load this folder as "unpacked")
  manifest.json
  background.js        service worker: navigation blocking + storage + messaging
  crypto.js             PBKDF2 password hashing (Web Crypto API)
  popup.html/js/css     toolbar popup: quick add/unlock/remove
  options.html/js/css   full settings page: password setup, site management
  blocked.html/js/css   the page shown instead of a blocked site
  icons/
.github/workflows/release.yml   CI/CD pipeline (see below)
scripts/publish-chrome-webstore.js   uploads + publishes a build to the Web Store
```

## Local development

No build step, no `npm install` — it's plain HTML/CSS/JS, so you load the
`extension/` folder straight into Chrome.

**Prerequisites:** Google Chrome (or any Chromium-based browser — Edge,
Brave, etc. all work the same way).

1. Get the code onto your machine — clone the repo, or unzip the download.
2. Open `chrome://extensions` in the address bar.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `extension/` folder (not the repo root).
5. SiteKeeper's icon appears in the toolbar. On first install its options
   page opens automatically — set your master password there before you
   block anything.
6. Click the toolbar icon to block a site (or use "Block this tab's site"),
   then visit that site to see the lock screen in action.

### Making changes

After editing any file in `extension/`, go back to `chrome://extensions` and
click the **reload icon** on the SiteKeeper card to pick up your changes —
Chrome doesn't hot-reload unpacked extensions automatically. If you changed
`background.js`, this also restarts the service worker. If something seems
stuck, use **Remove** and **Load unpacked** again for a clean reload.

Useful views while developing:
- **Service worker console:** on the extension's card, click "service worker" to open its DevTools and see `background.js` logs/errors.
- **Popup console:** right-click the toolbar icon → **Inspect popup**.
- **Options/blocked page console:** open the page normally, then open regular Chrome DevTools (F12) on it.

## How blocking works

`background.js` listens for `webNavigation.onBeforeNavigate` on the main
frame. If the destination hostname matches an entry in your blocked list and
isn't currently unlocked, the tab is redirected to `blocked.html`, which asks
for the master password before letting the original navigation through.

Known limitation: this is enforced by the extension, not the OS — a user
with access to `chrome://extensions` can always disable or remove the
extension itself. There's no way for any Chrome extension to prevent that.

## CI/CD — GitHub Actions

`.github/workflows/release.yml` runs on every push, to every branch, and on
version tags:

| Trigger                          | Channel     | GitHub Release              | Chrome Web Store |
|-----------------------------------|-------------|------------------------------|-------------------|
| push to `master`/`main`           | Production  | Full release                 | Not published     |
| push to any other branch          | Beta        | Pre-release (marked "beta")  | Not published     |
| push a tag matching `v*` (e.g. `v1.2.3`) | Production | Full release, reusing the pushed tag | **Published** via `CHROME_EXTENSION_ID` |

Only a pushed tag publishes to the Chrome Web Store. Every plain branch push
— including `master` — still builds the extension and creates a GitHub
release/pre-release so you always have a downloadable zip, but it stops
short of the Store. To actually ship a version:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The tag itself becomes the extension's version (so it must be a plain
numeric version, optionally prefixed with `v` — up to 4 dot-separated
segments, e.g. `v1.2.3` or `v1.2.3.4`). The workflow validates this and fails
fast with a clear error if the tag doesn't match.

For plain branch pushes (no tag), versioning is automatic instead: the
workflow reads `MAJOR.MINOR.PATCH` from `extension/manifest.json` and
appends the GitHub Actions run number as a 4th segment (e.g. `1.0.0.42`), so
build artifacts always have an increasing version even between tagged
releases.

### Required repository secrets

Chrome Web Store publishing uses a **Google Cloud Service Account** linked to
your publisher account (the [officially supported](https://developer.chrome.com/docs/webstore/service-accounts) way to automate
publishing — no personal sign-in, no refresh token, nothing that expires on
its own):

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project and enable the **Chrome Web Store API**.
2. Create a **service account** under **IAM & Admin → Service Accounts**. It doesn't need any project roles/permissions.
3. Open the service account → **Keys** tab → **Add key → Create new key → JSON**. This downloads a `.json` key file — keep it private, it's a credential.
4. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), go to **Account** and add the service account's email address (found in the JSON key as `client_email`). This grants it authority to manage every item under your publisher account. *Note: a publisher can only have one linked service account.*
5. Find your **publisher ID** in the Developer Dashboard under **Publisher → Settings**.
6. Upload your extension **once manually** to the Developer Dashboard to get an item/extension ID (required even for the very first automated publish).
7. Add these as **repository secrets** (Settings → Secrets and variables → Actions):

   | Secret                        | Value                                              |
   |-------------------------------|------------------------------------------------------|
   | `CHROME_SERVICE_ACCOUNT_KEY`  | The full contents of the JSON key file from step 3   |
   | `CHROME_PUBLISHER_ID`         | Publisher ID from step 5                             |
   | `CHROME_EXTENSION_ID`         | Item ID of your production listing                   |

8. Also confirm **Settings → Actions → General → Workflow permissions** is
   set to "Read and write permissions" so the workflow can create releases.

## Security notes

- The master password is never stored or transmitted in plaintext — only a
  random salt + PBKDF2-SHA256 hash (150,000 iterations) is saved, and that's
  the only password-related data that syncs to your Google account.
- Because blocking relies on `webNavigation`, it only intercepts standard
  page navigations (not, say, requests made from an already-open tab before
  you add a site to the list — reload the tab after blocking a site that's
  already open).

## License

MIT — see [LICENSE](./LICENSE). Update the copyright name in that file before publishing.
