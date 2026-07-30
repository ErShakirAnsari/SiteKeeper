const els = {
  banner: document.getElementById("noPasswordBanner"),
  goSetPassword: document.getElementById("goSetPassword"),
  addInput: document.getElementById("addInput"),
  addBtn: document.getElementById("addBtn"),
  addError: document.getElementById("addError"),
  siteList: document.getElementById("siteList"),
  emptyState: document.getElementById("emptyState"),
  addCurrentTab: document.getElementById("addCurrentTab"),
  openOptions: document.getElementById("openOptions"),

  dialogOverlay: document.getElementById("dialogOverlay"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogSubtitle: document.getElementById("dialogSubtitle"),
  unlockModeRow: document.getElementById("unlockModeRow"),
  timedMinutes: document.getElementById("timedMinutes"),
  dialogPassword: document.getElementById("dialogPassword"),
  dialogError: document.getElementById("dialogError"),
  dialogCancel: document.getElementById("dialogCancel"),
  dialogConfirm: document.getElementById("dialogConfirm"),
};

let pendingAction = null; // { type: 'unlock' | 'remove', id, hostname }

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function formatRemaining(ms) {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  if (totalMin < 60) return `${totalMin}m left`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m left`;
}

function renderSites(state) {
  els.banner.classList.toggle("hidden", state.hasPassword);
  els.siteList.innerHTML = "";
  els.emptyState.classList.toggle("hidden", state.sites.length > 0);

  for (const site of state.sites) {
    const row = document.createElement("div");
    row.className = "site-row";

    const info = document.createElement("div");
    info.className = "site-info";

    const host = document.createElement("span");
    host.className = "site-host";
    host.textContent = site.hostname;
    info.appendChild(host);

    const pill = document.createElement("span");
    if (site.status === "blocked") {
      pill.className = "status-pill status-blocked";
      pill.textContent = "Blocked";
    } else {
      pill.className = "status-pill status-unlocked";
      pill.textContent =
        site.status === "unlocked-timed"
          ? `Unlocked · ${formatRemaining(site.remainingMs)}`
          : "Unlocked · this tab";
    }
    info.appendChild(pill);
    row.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "site-actions";

    if (site.status === "blocked") {
      const unlockBtn = document.createElement("button");
      unlockBtn.className = "mini-btn";
      unlockBtn.title = "Unlock";
      unlockBtn.textContent = "🔓";
      unlockBtn.addEventListener("click", () => openDialog("unlock", site));
      actions.appendChild(unlockBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "mini-btn danger";
    removeBtn.title = "Remove";
    removeBtn.textContent = "🗑";
    removeBtn.addEventListener("click", () => openDialog("remove", site));
    actions.appendChild(removeBtn);

    row.appendChild(actions);
    els.siteList.appendChild(row);
  }
}

async function refresh() {
  const state = await send({ type: "GET_STATE" });
  renderSites(state);
}

function openDialog(type, site) {
  pendingAction = { type, id: site.id, hostname: site.hostname };
  els.dialogError.classList.add("hidden");
  els.dialogPassword.value = "";

  if (type === "unlock") {
    els.dialogTitle.textContent = "Unlock site";
    els.dialogSubtitle.textContent = site.hostname;
    els.unlockModeRow.classList.remove("hidden");
    els.dialogConfirm.textContent = "Unlock";
  } else {
    els.dialogTitle.textContent = "Remove site";
    els.dialogSubtitle.textContent = `Delete ${site.hostname} from your list completely.`;
    els.unlockModeRow.classList.add("hidden");
    els.dialogConfirm.textContent = "Remove";
  }
  els.dialogOverlay.classList.remove("hidden");
  els.dialogPassword.focus();
}

function closeDialog() {
  els.dialogOverlay.classList.add("hidden");
  pendingAction = null;
}

async function confirmDialog() {
  if (!pendingAction) return;
  const password = els.dialogPassword.value;

  let result;
  if (pendingAction.type === "unlock") {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const minutes = els.timedMinutes.value;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    result = await send({
      type: "UNLOCK_SITE",
      id: pendingAction.id,
      password,
      mode,
      minutes,
      tabId: tab?.id,
    });
    if (!result.error && tab) {
      chrome.tabs.update(tab.id, { url: `https://${pendingAction.hostname}` });
    }
  } else {
    result = await send({ type: "REMOVE_SITE", id: pendingAction.id, password });
  }

  if (result.error) {
    els.dialogError.textContent = result.error;
    els.dialogError.classList.remove("hidden");
    return;
  }
  closeDialog();
  refresh();
}

els.dialogCancel.addEventListener("click", closeDialog);
els.dialogConfirm.addEventListener("click", confirmDialog);
els.dialogPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmDialog();
});

els.addBtn.addEventListener("click", async () => {
  const value = els.addInput.value;
  if (!value.trim()) return;
  els.addError.classList.add("hidden");
  const result = await send({ type: "ADD_SITE", input: value });
  if (result.error) {
    els.addError.textContent = result.error;
    els.addError.classList.remove("hidden");
    return;
  }
  els.addInput.value = "";
  renderSites(result);
});
els.addInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.addBtn.click();
});

els.addCurrentTab.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  try {
    const hostname = new URL(tab.url).hostname;
    const result = await send({ type: "ADD_SITE", input: hostname });
    if (result.error) {
      els.addError.textContent = result.error;
      els.addError.classList.remove("hidden");
      return;
    }
    renderSites(result);
  } catch {
    els.addError.textContent = "This tab can't be blocked.";
    els.addError.classList.remove("hidden");
  }
});

els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.goSetPassword.addEventListener("click", () => chrome.runtime.openOptionsPage());

refresh();
