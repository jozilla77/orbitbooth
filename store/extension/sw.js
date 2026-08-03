// Orbit Jump — background service worker.
// The game is a full-screen experience, so clicking the toolbar icon opens the
// bundled game in its own tab (rather than a cramped popup).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
