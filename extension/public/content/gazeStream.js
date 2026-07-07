// Wraps WebGazer's gaze callback in a plain pub-sub so other content-script
// modules (gazeDot.js now, the enlarge/blur logic in sub-project #2 later)
// subscribe without touching WebGazer directly.
(function () {
  const listeners = new Set();
  let started = false;

  function emit(point) {
    for (const cb of listeners) {
      try {
        cb(point);
      } catch (e) {
        console.error('[AcessLens] gaze listener error', e);
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    window.webgazer.setGazeListener((data, timestamp) => {
      if (!data) return;
      emit({ x: data.x, y: data.y, timestamp });
    });
  }

  function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  function stop() {
    started = false;
    listeners.clear();
  }

  window.__acesslens = window.__acesslens || {};
  window.__acesslens.gazeStream = {
    start,
    subscribe,
    stop,
    // Test-only: feeds a synthetic point through the same emit() path real
    // WebGazer predictions use. Lets automated verification (no webcam/face
    // available) exercise the enlarge/blur switching logic directly instead
    // of depending on real face detection.
    debugEmit: emit,
  };
})();
