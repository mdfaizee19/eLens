// Visible gaze indicator - a small dot that follows tracked gaze. Exists
// purely to verify tracking is working during this phase; a settings toggle
// to hide it can be added once sub-project #2's enlarge/blur effect makes it
// redundant.
(function () {
  let dotEl = null;
  let unsubscribe = null;

  function ensureDot() {
    if (dotEl) return dotEl;
    dotEl = document.createElement('div');
    dotEl.id = 'acesslens-gaze-dot';
    Object.assign(dotEl.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '16px',
      height: '16px',
      borderRadius: '50%',
      background: 'rgba(255, 0, 90, 0.55)',
      border: '2px solid white',
      boxShadow: '0 0 6px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate(-50%, -50%)',
      transition: 'left 0.05s linear, top 0.05s linear',
    });
    document.documentElement.appendChild(dotEl);
    return dotEl;
  }

  function show() {
    ensureDot().style.display = 'block';
    unsubscribe = window.__acesslens.gazeStream.subscribe(({ x, y }) => {
      const el = ensureDot();
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });
  }

  function hide() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (dotEl) {
      dotEl.remove();
      dotEl = null;
    }
  }

  window.__acesslens = window.__acesslens || {};
  window.__acesslens.gazeDot = { show, hide };
})();
