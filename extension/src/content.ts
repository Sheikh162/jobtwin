// Jobtwin Autofill content script.
// Fills saved profile data into Greenhouse / Lever application forms.
// Password-manager mental model: saved once, filled everywhere.

(() => {
  function isSupported(): boolean {
    return (
      location.hostname.includes("greenhouse.io") || location.hostname.includes("lever.co")
    );
  }

  interface Profile {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    headline?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    githubUsername?: string;
  }

  function setInput(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    el.setAttribute("data-jobtwin-filled", "yes");
  }

  // Find form controls by their <label> text. Returns a unique list.
  function findCandidates(labelText: string[]): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
    const labels = Array.from(document.querySelectorAll("label"));
    const found: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = [];
    for (const label of labels) {
      const text = (label.textContent ?? "").toLowerCase();
      if (labelText.some((t) => text.includes(t))) {
        const htmlFor = label.getAttribute("for");
        if (htmlFor) {
          const el = document.getElementById(htmlFor);
          if (el) found.push(el as HTMLInputElement);
        } else {
          const el = label.querySelector("input, textarea, select") as HTMLInputElement | null;
          if (el) found.push(el);
        }
      }
    }
    return Array.from(new Set(found));
  }

  function fillField(
    els: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    value: string
  ) {
    if (!value) return;
    // Prefer unfilled controls so we don't clobber user-corrected data.
    const el = els.find((e) => !e.hasAttribute("data-jobtwin-filled")) ?? els[0];
    if (el) setInput(el, value);
  }

  function fill(profile: Profile | null) {
    if (!profile) return;
    const firstName = profile.firstName || profile.fullName?.split(" ")[0];
    const lastName =
      profile.lastName || profile.fullName?.split(" ").slice(1).join(" ") || "";

    const mappings: Array<{ labels: string[]; value?: string }> = [
      { labels: ["first name"], value: firstName },
      { labels: ["last name", "surname"], value: lastName },
      { labels: ["email"], value: profile.email },
      { labels: ["phone"], value: profile.phone },
      { labels: ["headline", "current title", "job title"], value: profile.headline },
      { labels: ["linkedin"], value: profile.linkedinUrl },
      { labels: ["github", "portfolio", "website"], value: profile.githubUrl || profile.githubUsername },
    ];

    for (const m of mappings) {
      if (!m.value) continue;
      const els = findCandidates(m.labels);
      if (els.length) fillField(els, m.value);
    }
  }

  let cachedProfile: Profile | null = null;

  // Re-fill as the multi-step form advances.
  if (isSupported()) {
    new MutationObserver(() => {
      if (cachedProfile) fill(cachedProfile);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // The popup sends the saved profile and asks us to fill the current form.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "JOBTWIN_FILL") {
      cachedProfile = msg.profile ?? null;
      fill(cachedProfile);
      sendResponse({ ok: true, filled: isSupported() });
    }
  });
})();