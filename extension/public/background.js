// Tracks which tabs currently have the gaze-tracking content script injected
// and active. In-memory only (service worker can be evicted and this map
// lost - that's fine, worst case a stale toolbar click re-injects cleanly).
const activeTabs = new Set();

// The AcessLens frontend's own PDF viewer route - a real http(s) page, which
// is required (not optional) for the gaze effect to work on a PDF at all:
// Chrome's native PDF viewer doesn't expose real DOM text (confirmed by
// testing), and a sandboxed extension page can't use the webcam (opaque
// origin - also confirmed by testing, "Invalid security origin" is the
// browser's own error for this). A real web origin is the only context that
// satisfies both "camera works" and "eval works" at once. Change this for
// a production deployment of the frontend.
const FRONTEND_PDF_VIEWER_URL = 'http://localhost:5173/pdf-viewer';

// isolatedBridge.js runs in the default (isolated) world - it's the only
// file with chrome.storage/chrome.runtime access. Injected FIRST so its
// listeners are guaranteed registered before the main-world files dispatch
// anything (no ready/handshake race).
const ISOLATED_WORLD_FILES = ['content/isolatedBridge.js'];

// WebGazer's mediapipe/WASM asset loader breaks under isolated-world
// injection (relies on execution-context specifics that differ there) -
// see README. So these all run in the MAIN world instead, communicating
// with isolatedBridge.js purely via DOM CustomEvents.
const MAIN_WORLD_FILES = [
  'vendor/webgazer.js',
  'content/gazeStream.js',
  'content/calibrationOverlay.js',
  'content/gazeDot.js',
  'content/gazeFocus.js',
  'content/mainWorld.js',
];

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  if (activeTabs.has(tab.id)) {
    await chrome.tabs.sendMessage(tab.id, { type: 'ACESSLENS_DISABLE' }).catch(() => {});
    activeTabs.delete(tab.id);
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ISOLATED_WORLD_FILES,
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: MAIN_WORLD_FILES,
    world: 'MAIN',
  });
  activeTabs.add(tab.id);
  chrome.action.setBadgeText({ tabId: tab.id, text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#16a34a' });
});

chrome.tabs.onRemoved.addListener((tabId) => activeTabs.delete(tabId));

// "Open with AcessLens" - renders the PDF through the AcessLens frontend's
// own PDF.js-based viewer instead of Chrome's built-in one, which doesn't
// expose PDF text as real DOM (confirmed by direct testing - see README).
// Only offered explicitly via right-click, never automatic.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'acesslens-open-pdf-link',
    title: 'Open with AcessLens',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.pdf#*'],
  });
  chrome.contextMenus.create({
    id: 'acesslens-open-pdf-page',
    title: 'Open this PDF with AcessLens',
    contexts: ['page'],
    documentUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.pdf#*'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const pdfUrl = info.linkUrl || info.pageUrl;
  if (!pdfUrl) return;
  const viewerUrl = FRONTEND_PDF_VIEWER_URL + '?file=' + encodeURIComponent(pdfUrl);
  chrome.tabs.create({ url: viewerUrl, index: (tab?.index ?? 0) + 1 });
});

// Popup asks this for current status / requests a recalibration.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ACESSLENS_GET_STATUS') {
    sendResponse({ active: sender.tab ? activeTabs.has(sender.tab.id) : false });
    return true;
  }
  if (message.type === 'ACESSLENS_QUERY_ACTIVE_TAB_STATUS') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse({ active: tab ? activeTabs.has(tab.id) : false, tabId: tab?.id });
    });
    return true; // async response
  }
  if (message.type === 'ACESSLENS_RECALIBRATE') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'ACESSLENS_RECALIBRATE' }).catch(() => {});
    });
    return true;
  }
});
