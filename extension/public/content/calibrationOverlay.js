// Full-screen 9-point click calibration. WebGazer trains on every click by
// default (its own document-level click listener), so this overlay's job is
// purely UX: show 9 targets, require a few clicks on each while the user
// looks at it, and report progress. The actual training happens inside
// WebGazer as those clicks land.
(function () {
  const CLICKS_PER_POINT = 5;
  const GRID = [
    [0.08, 0.08], [0.5, 0.08], [0.92, 0.08],
    [0.08, 0.5], [0.5, 0.5], [0.92, 0.5],
    [0.08, 0.92], [0.5, 0.92], [0.92, 0.92],
  ];

  let overlayEl = null;

  function buildOverlay(onComplete) {
    const overlay = document.createElement('div');
    overlay.id = 'acesslens-calibration-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(15, 15, 20, 0.92)',
      zIndex: '2147483647',
      fontFamily: 'system-ui, sans-serif',
    });

    const message = document.createElement('div');
    Object.assign(message.style, {
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'white',
      fontSize: '16px',
      textAlign: 'center',
    });
    message.textContent = `AcessLens calibration - click each dot ${CLICKS_PER_POINT} times while looking at it`;
    overlay.appendChild(message);

    const counts = new Array(GRID.length).fill(0);
    const dots = GRID.map(([xf, yf], i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Calibration point ${i + 1}`);
      Object.assign(dot.style, {
        position: 'fixed',
        left: `calc(${xf * 100}% - 14px)`,
        top: `calc(${yf * 100}% - 14px)`,
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: 'none',
        background: '#ef4444',
        cursor: 'pointer',
        padding: '0',
      });
      dot.addEventListener('click', () => {
        counts[i] += 1;
        const progress = Math.min(counts[i] / CLICKS_PER_POINT, 1);
        dot.style.background = progress >= 1 ? '#16a34a' : '#f59e0b';
        if (counts.every((c) => c >= CLICKS_PER_POINT)) {
          overlay.remove();
          overlayEl = null;
          onComplete();
        }
      });
      overlay.appendChild(dot);
      return dot;
    });

    return overlay;
  }

  function start(onComplete) {
    if (overlayEl) return;
    overlayEl = buildOverlay(onComplete);
    document.documentElement.appendChild(overlayEl);
  }

  function cancel() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  window.__acesslens = window.__acesslens || {};
  window.__acesslens.calibrationOverlay = { start, cancel };
})();
