// Runs in the ISOLATED world (default for content scripts) - the only file
// that touches chrome.storage/chrome.runtime. WebGazer itself must run in
// the MAIN world (see mainWorld.js) because its mediapipe/WASM asset loader
// resolves paths in a way that breaks under isolated-world injection - see
// README for the full explanation. The two worlds talk via plain DOM
// CustomEvents, since they share the DOM but not JS globals.
(function () {
  const STORAGE_KEY = 'acesslens_calibration_data';

  document.addEventListener('acesslens:request-calibration', async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    document.dispatchEvent(
      new CustomEvent('acesslens:calibration-response', { detail: result[STORAGE_KEY] || null }),
    );
  });

  document.addEventListener('acesslens:save-calibration', async (e) => {
    await chrome.storage.local.set({ [STORAGE_KEY]: e.detail });
    console.log('[AcessLens] calibration saved,', e.detail.length, 'samples');
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ACESSLENS_DISABLE') {
      document.dispatchEvent(new CustomEvent('acesslens:disable'));
    } else if (message.type === 'ACESSLENS_RECALIBRATE') {
      chrome.storage.local.remove(STORAGE_KEY).then(() => {
        document.dispatchEvent(new CustomEvent('acesslens:recalibrate'));
      });
    }
  });

  // Request/response, not an eager broadcast: mainWorld.js is injected in a
  // separate later executeScript call, so if this dispatched the path
  // immediately on load, mainWorld.js's listener wouldn't exist yet and the
  // event would be lost. Instead mainWorld.js asks for it once it's ready to
  // listen, and this (already-injected, already-listening) responds.
  document.addEventListener('acesslens:request-mediapipe-path', () => {
    document.dispatchEvent(
      new CustomEvent('acesslens:mediapipe-path', {
        detail: chrome.runtime.getURL('vendor/mediapipe/face_mesh'),
      }),
    );
  });
})();
