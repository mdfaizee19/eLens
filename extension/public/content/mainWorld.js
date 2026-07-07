// Runs in the MAIN world alongside webgazer.js - required because WebGazer's
// mediapipe/WASM asset loader breaks when injected into the isolated world
// (content scripts' default). Talks to isolatedBridge.js (which has the
// chrome.storage/chrome.runtime access this can't have) via DOM CustomEvents.
(function () {
  function serializePatch(patch) {
    return { data: Array.from(patch.data), width: patch.width, height: patch.height };
  }

  function deserializePatch(stored) {
    return new ImageData(new Uint8ClampedArray(stored.data), stored.width, stored.height);
  }

  function serializeCalibrationData(rawData) {
    return rawData.map((sample) => ({
      screenPos: sample.screenPos,
      type: sample.type,
      eyes: {
        left: { ...serializePatch(sample.eyes.left.patch), imagex: sample.eyes.left.imagex, imagey: sample.eyes.left.imagey },
        right: { ...serializePatch(sample.eyes.right.patch), imagex: sample.eyes.right.imagex, imagey: sample.eyes.right.imagey },
      },
    }));
  }

  function deserializeCalibrationData(stored) {
    return stored.map((sample) => ({
      screenPos: sample.screenPos,
      type: sample.type,
      eyes: {
        left: { patch: deserializePatch(sample.eyes.left), imagex: sample.eyes.left.imagex, imagey: sample.eyes.left.imagey, width: sample.eyes.left.width, height: sample.eyes.left.height },
        right: { patch: deserializePatch(sample.eyes.right), imagex: sample.eyes.right.imagex, imagey: sample.eyes.right.imagey, width: sample.eyes.right.width, height: sample.eyes.right.height },
      },
    }));
  }

  function waitForEvent(type) {
    return new Promise((resolve) => {
      document.addEventListener(type, (e) => resolve(e.detail), { once: true });
    });
  }

  async function runCalibration() {
    return new Promise((resolve) => {
      window.__acesslens.calibrationOverlay.start(() => {
        const rawData = window.webgazer.getRegression()[0].getData();
        document.dispatchEvent(
          new CustomEvent('acesslens:save-calibration', { detail: serializeCalibrationData(rawData) }),
        );
        resolve();
      });
    });
  }

  async function init() {
    const mediapipePathPromise = waitForEvent('acesslens:mediapipe-path');
    document.dispatchEvent(new CustomEvent('acesslens:request-mediapipe-path'));
    const mediapipePath = await mediapipePathPromise;

    window.webgazer.params.saveDataAcrossSessions = false;
    window.webgazer.params.faceMeshSolutionPath = mediapipePath;
    window.webgazer.showVideoPreview(false).showPredictionPoints(false);

    await window.webgazer.begin();

    document.dispatchEvent(new CustomEvent('acesslens:request-calibration'));
    const stored = await waitForEvent('acesslens:calibration-response');

    let restored = false;
    if (stored && stored.length > 0) {
      try {
        window.webgazer.getRegression()[0].setData(deserializeCalibrationData(stored));
        restored = true;
        console.log('[AcessLens] calibration restored,', stored.length, 'samples');
      } catch (e) {
        console.error('[AcessLens] failed to restore calibration', e);
      }
    }
    if (!restored) {
      await runCalibration();
    }

    window.__acesslens.gazeStream.start();
    window.__acesslens.gazeDot.show();
    window.__acesslens.gazeFocus.start();
    console.log('[AcessLens] gaze tracking active');
  }

  function teardown() {
    window.__acesslens.gazeFocus.stop();
    window.__acesslens.gazeDot.hide();
    window.__acesslens.gazeStream.stop();
    window.__acesslens.calibrationOverlay.cancel();
    try {
      window.webgazer.end();
    } catch (e) {
      // wasn't running - fine
    }
    console.log('[AcessLens] gaze tracking stopped');
  }

  document.addEventListener('acesslens:disable', teardown);
  document.addEventListener('acesslens:recalibrate', () => {
    runCalibration();
  });

  init().catch((err) => console.error('[AcessLens] init failed', err));
})();
