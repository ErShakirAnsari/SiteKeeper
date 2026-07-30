const params = new URLSearchParams(location.search);
const siteId = params.get("site");
const hostname = params.get("host") || "";
const originalUrl = params.get("url") || `https://${hostname}`;

document.getElementById("hostname").textContent = hostname;

const form = document.getElementById("unlockForm");
const passwordInput = document.getElementById("password");
const errorEl = document.getElementById("error");
const timedMinutes = document.getElementById("timedMinutes");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const mode = document.querySelector('input[name="mode"]:checked').value;
  const tab = await chrome.tabs.getCurrent();

  const result = await chrome.runtime.sendMessage({
    type: "UNLOCK_SITE",
    id: siteId,
    password: passwordInput.value,
    mode,
    minutes: timedMinutes.value,
    tabId: tab?.id,
    originalUrl,
  });

  if (result.error) {
    errorEl.textContent = result.error;
    errorEl.classList.remove("hidden");
    passwordInput.value = "";
    passwordInput.focus();
    return;
  }

  location.href = originalUrl;
});

document.getElementById("goBack").addEventListener("click", () => {
  if (history.length > 1) {
    history.back();
  } else {
    location.href = "https://www.google.com";
  }
});

document.getElementById("openSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
