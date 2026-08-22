// Jobtwin Autofill background service worker.
// Fetches the user's parsed profile from the Jobtwin API so the popup and
// content scripts have data without asking the user to re-type it.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "jobtwin-fill",
    title: "Fill with Jobtwin profile",
    contexts: ["editable"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "jobtwin-fill" && tab?.id != null) {
    syncProfile().then((profile) => {
      if (profile) {
        chrome.tabs.sendMessage(tab.id!, { type: "JOBTWIN_FILL", profile });
      }
    });
  }
});

async function syncProfile() {
  const { apiUrl, token, profile } = await chrome.storage.local.get([
    "apiUrl",
    "token",
    "profile",
  ]);
  if (profile) return profile;
  if (!apiUrl || !token) return null;

  try {
    const res = await fetch(`${apiUrl}/api/profile/sync`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    await chrome.storage.local.set({ profile: data.profile });
    return data.profile;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "JOBTWIN_SYNC") {
    syncProfile().then((profile) => sendResponse({ profile }));
    return true; // async response
  }
});