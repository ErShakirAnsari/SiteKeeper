const els = {
  passwordCardTitle: document.getElementById("passwordCardTitle"),
  currentPasswordRow: document.getElementById("currentPasswordRow"),
  currentPassword: document.getElementById("currentPassword"),
  newPasswordLabel: document.getElementById("newPasswordLabel"),
  newPassword: document.getElementById("newPassword"),
  confirmPassword: document.getElementById("confirmPassword"),
  passwordError: document.getElementById("passwordError"),
  passwordSuccess: document.getElementById("passwordSuccess"),
  savePassword: document.getElementById("savePassword"),

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

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function renderSites(state) {
  if (state.hasPassword) {
    els.passwordCardTitle.textContent = "Change your master password";
    els.currentPasswordRow.classList.remove("hidden");
    els.newPasswordLabel.textContent = "New password";
  } else {
    els.passwordCardTitle.textContent = "Set your master password";
    els.currentPasswordRow.classList.add("hidden");
    els.newPasswordLabel.textContent = "New password";
  }

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
  refresh();
});

refresh();
