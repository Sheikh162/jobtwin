// Popup: fetch saved profile and ask the active tab's content script to fill.
// Also hosts the API URL + token settings used by background.syncProfile().

document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status")!;
  const result = document.getElementById("result")!;
  const fillBtn = document.getElementById("fill") as HTMLButtonElement;
  const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
  const tokenInput = document.getElementById("token") as HTMLInputElement;
  const saveBtn = document.getElementById("save") as HTMLButtonElement;
  const saveStatus = document.getElementById("save-status")!;

  // Load saved settings.
  void chrome.storage.local.get(["apiUrl", "token", "profile"], (data) => {
    apiUrlInput.value = data.apiUrl ?? "";
    tokenInput.value = data.token ?? "";
    if (data.profile) {
      result.textContent = `Profile synced as ${data.profile.fullName ?? "user"}.`;
    }
  });

  // Save settings + ask the background worker to fetch a fresh profile.
  saveBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({
      apiUrl: apiUrlInput.value.trim(),
      token: tokenInput.value.trim(),
      profile: null, // force re-sync
    });
    saveStatus.textContent = "Saved. Syncing profile…";
    chrome.runtime.sendMessage({ type: "JOBTWIN_SYNC" }, (res) => {
      if (res?.profile) {
        saveStatus.textContent = `Synced as ${res.profile.fullName ?? "user"}.`;
      } else {
        saveStatus.textContent = "Sync failed — check URL/token, then upload a resume on jobtwin.";
      }
    });
  });

  void chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const host = tab?.url ? new URL(tab.url).hostname : "";
    const supported = host.includes("greenhouse.io") || host.includes("lever.co");
    status.textContent = supported
      ? "Application detected. Fill with your saved profile."
      : "Not a Greenhouse/Lever form. Open an application to autofill.";

    fillBtn.addEventListener("click", async () => {
      const { profile } = await chrome.storage.local.get("profile");
      if (!profile) {
        result.textContent = "No profile yet. Save API URL + token to sync, or upload a resume on jobtwin.";
        return;
      }
      if (!tab?.id) {
        result.textContent = "No active tab.";
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "JOBTWIN_FILL", profile });
        result.textContent = "Filled.";
      } catch {
        result.textContent = "Reload the application page and tap again.";
      }
    });
  });
});