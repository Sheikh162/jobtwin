// Popup: fetch saved profile and ask the active tab's content script to fill.

document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status")!;
  const result = document.getElementById("result")!;
  const fillBtn = document.getElementById("fill") as HTMLButtonElement;

  void chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const host = tab?.url ? new URL(tab.url).hostname : "";
    const supported = host.includes("greenhouse.io") || host.includes("lever.co");
    status.textContent = supported
      ? "Application detected. Fill with your saved profile."
      : "Not a Greenhouse/Lever form. Open an application to autofill.";

    fillBtn.addEventListener("click", async () => {
      const { profile } = await chrome.storage.local.get("profile");
      if (!profile) {
        result.textContent = "No profile saved yet. Upload a resume on jobtwin.";
        return;
      }
      if (!tab?.id) {
        result.textContent = "No active tab.";
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "JOBTWIN_FILL",
          profile,
        });
        result.textContent = "Filled.";
      } catch {
        result.textContent = "Reload the application page and tap again.";
      }
    });
  });
});