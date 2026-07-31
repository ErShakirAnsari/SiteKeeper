const els = {
  passwordCardTitle: document.getElementById("passwordCardTitle"),
  passwordMenuWrap: document.getElementById("passwordMenuWrap"),
  passwordMenuBtn: document.getElementById("passwordMenuBtn"),
  passwordMenu: document.getElementById("passwordMenu"),
  menuChangePassword: document.getElementById("menuChangePassword"),
  menuSyncNow: document.getElementById("menuSyncNow"),
  passwordSummary: document.getElementById("passwordSummary"),
  syncStatus: document.getElementById("syncStatus"),
  passwordFormWrap: document.getElementById("passwordFormWrap"),
  currentPasswordRow: document.getElementById("currentPasswordRow"),
  currentPassword: document.getElementById("currentPassword"),
  newPasswordLabel: document.getElementById("newPasswordLabel"),
  newPassword: document.getElementById("newPassword"),
  confirmPassword: document.getElementById("confirmPassword"),
  passwordError: document.getElementById("passwordError"),
  passwordSuccess: document.getElementById("passwordSuccess"),
  savePassword: document.getElementById("savePassword"),
  cancelPasswordEdit: document.getElementById("cancelPasswordEdit"),

  addInput: document.getElementById("addInput"),
  addBtn: document.getElementById("addBtn"),
  addError: document.getElementById("addError"),
  siteList: document.getElementById("siteList"),
  emptyState: document.getElementById("emptyState"),

  dialogOverlay: document.getElementById("dialogOverlay"),
  dialogSubtitle: document.getElementById("dialogSubtitle"),
  dialogPassword: document.getElementById("dialogPassword"),
  dialogError: document.getElementById("dialogError"),
  dialogCancel: document.getElementById("dialogCancel"),
  dialogConfirm: document.getElementById("dialogConfirm"),
};

let pendingRemoveId = null;
let lastState = null;
// Whether the password form is expanded. Only meaningful once a password
// already exists — before that, the form is always shown.
let passwordFormOpen = false;
let syncStatusTimer = null;

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function clearPasswordFields() {
  els.currentPassword.value = "";
  els.newPassword.value = "";
  els.confirmPassword.value = "";
  els.passwordError.classList.add("hidden");
  els.passwordSuccess.classList.add("hidden");
}

// Applies the current hasPassword + passwordFormOpen combination to the DOM.
function applyPasswordSectionState(hasPassword) {
  if (hasPassword) {
    els.passwordCardTitle.textContent = "Master password";
    els.passwordMenuWrap.classList.remove("hidden");
    els.passwordSummary.classList.remove("hidden");
    els.currentPasswordRow.classList.remove("hidden");
    els.cancelPasswordEdit.classList.remove("hidden");
    els.passwordFormWrap.classList.toggle("hidden", !passwordFormOpen);
  } else {
    els.passwordCardTitle.textContent = "Set your master password";
    els.passwordMenuWrap.classList.add("hidden");
    els.passwordSummary.classList.add("hidden");
    els.currentPasswordRow.classList.add("hidden");
    els.cancelPasswordEdit.classList.add("hidden");
    els.passwordFormWrap.classList.remove("hidden"); // always visible until a password exists
  }
}

function closePasswordMenu() {
  els.passwordMenu.classList.add("hidden");
}

function openPasswordForm() {
  passwordFormOpen = true;
  applyPasswordSectionState(true);
  els.currentPassword.focus();
}

function collapsePasswordForm() {
  passwordFormOpen = false;
  clearPasswordFields();
  applyPasswordSectionState(lastState ? lastState.hasPassword : false);
}

function showSyncStatus(text) {
  if (syncStatusTimer) clearTimeout(syncStatusTimer);
  els.syncStatus.textContent = text;
  els.syncStatus.classList.remove("hidden");
  syncStatusTimer = setTimeout(() => {
    els.syncStatus.classList.add("hidden");
  }, 3000);
}

function renderSites(state) {
  lastState = state;
  applyPasswordSectionState(state.hasPassword);

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
      pill.textContent = "Unlocked";
    }
    info.appendChild(pill);
    row.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "site-actions";

    const removeBtn = document.createElement("button");
    removeBtn.className = "mini-btn danger";
    removeBtn.title = "Remove";
    removeBtn.textContent = "🗑";
    removeBtn.addEventListener("click", () => openRemoveDialog(site));
    actions.appendChild(removeBtn);

    row.appendChild(actions);
    els.siteList.appendChild(row);
  }
}

async function refresh() {
  const state = await send({ type: "GET_STATE" });
  renderSites(state);
  return state;
}

function openRemoveDialog(site) {
  pendingRemoveId = site.id;
  els.dialogSubtitle.textContent = `Delete ${site.hostname} from your list completely.`;
  els.dialogPassword.value = "";
  els.dialogError.classList.add("hidden");
  els.dialogOverlay.classList.remove("hidden");
  els.dialogPassword.focus();
}

function closeDialog() {
  els.dialogOverlay.classList.add("hidden");
  pendingRemoveId = null;
}

els.dialogCancel.addEventListener("click", closeDialog);
els.dialogConfirm.addEventListener("click", async () => {
  const result = await send({
    type: "REMOVE_SITE",
    id: pendingRemoveId,
    password: els.dialogPassword.value,
  });
  if (result.error) {
    els.dialogError.textContent = result.error;
    els.dialogError.classList.remove("hidden");
    return;
  }
  closeDialog();
  refresh();
});
els.dialogPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.dialogConfirm.click();
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

// --- Password dropdown menu -------------------------------------------------

els.passwordMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  els.passwordMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!els.passwordMenuWrap.contains(e.target)) closePasswordMenu();
});

els.menuChangePassword.addEventListener("click", () => {
  closePasswordMenu();
  openPasswordForm();
});

els.menuSyncNow.addEventListener("click", async () => {
  closePasswordMenu();
  els.menuSyncNow.disabled = true;
  await refresh();
  els.menuSyncNow.disabled = false;
  showSyncStatus("Synced just now");
});

els.cancelPasswordEdit.addEventListener("click", collapsePasswordForm);

// --- Password form -----------------------------------------------------------

els.savePassword.addEventListener("click", async () => {
  els.passwordError.classList.add("hidden");
  els.passwordSuccess.classList.add("hidden");

  const newPassword = els.newPassword.value;
  const confirmPassword = els.confirmPassword.value;
  const currentPassword = els.currentPassword.value;

  if (newPassword !== confirmPassword) {
    els.passwordError.textContent = "Passwords don't match.";
    els.passwordError.classList.remove("hidden");
    return;
  }

  const result = await send({
    type: "SET_PASSWORD",
    newPassword,
    currentPassword,
  });

  if (result.error) {
    els.passwordError.textContent = result.error;
    els.passwordError.classList.remove("hidden");
    return;
  }

  els.passwordSuccess.textContent = "Password saved.";
  els.passwordSuccess.classList.remove("hidden");
  els.newPassword.value = "";
  els.confirmPassword.value = "";
  els.currentPassword.value = "";
  await refresh();

  // Give the user a moment to see the confirmation, then fold the form
  // back into the dropdown-only view (only relevant once a password exists).
  if (lastState && lastState.hasPassword) {
    setTimeout(collapsePasswordForm, 1200);
  }
});

refresh();
