// The actual reading-assist effect: enlarges whatever text block the user
// is looking at and blurs the rest, updating continuously as gaze moves
// down (or anywhere on) the page. Subscribes to gazeStream - has no idea
// WebGazer exists.
(function () {
  // .textLayer matches PDF.js's per-page text layer (see viewer/) - PDF.js
  // renders each line as a small absolutely-positioned span, too granular to
  // use directly, so a PDF "block" is a whole page instead of a paragraph.
  const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, dt, dd, .textLayer';
  const MIN_TEXT_LENGTH = 12; // skip near-empty elements (icons, spacers)
  const DWELL_MS = 150; // gaze must settle on a new block this long before switching, to avoid flicker
  const RESCAN_DEBOUNCE_MS = 250;

  let candidates = new Set();
  let activeEl = null;
  let pendingEl = null;
  let pendingSince = 0;
  let unsubscribe = null;
  let styleEl = null;
  let mutationObserver = null;
  let rescanTimer = null;

  function injectStyles() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'acesslens-gaze-focus-styles';
    styleEl.textContent = `
      .acesslens-blurred {
        filter: blur(3px);
        opacity: 0.55;
        transition: filter 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
      }
      .acesslens-focused {
        filter: none;
        opacity: 1;
        transform: scale(1.15);
        transform-origin: left center;
        transition: filter 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
        position: relative;
        z-index: 2147483000;
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Re-scans the live DOM for candidate blocks instead of a one-time
  // snapshot. Matters in practice: tracking is often turned on before the
  // page's real content exists yet (e.g. the AcessLens frontend renders its
  // reading cards only after a PDF is uploaded, which can happen after
  // tracking is already on). A MutationObserver keeps candidates current as
  // content is added, removed, or replaced.
  function rescanCandidates() {
    const found = new Set(
      Array.from(document.querySelectorAll(BLOCK_SELECTOR)).filter(
        (el) => el.textContent.trim().length >= MIN_TEXT_LENGTH,
      ),
    );

    for (const el of candidates) {
      if (!found.has(el) || !el.isConnected) {
        el.classList.remove('acesslens-blurred', 'acesslens-focused');
        if (el === activeEl) activeEl = null;
        if (el === pendingEl) pendingEl = null;
      }
    }

    for (const el of found) {
      if (!candidates.has(el)) {
        el.classList.add('acesslens-blurred');
      }
    }

    candidates = found;
  }

  function scheduleRescan() {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(rescanCandidates, RESCAN_DEBOUNCE_MS);
  }

  function findBlockUnderY(y) {
    let best = null;
    let bestDist = Infinity;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue; // offscreen
      if (y >= rect.top && y <= rect.bottom) return el; // direct hit
      const centerDist = Math.abs(y - (rect.top + rect.height / 2));
      if (centerDist < bestDist) {
        bestDist = centerDist;
        best = el;
      }
    }
    return best;
  }

  function setActive(el) {
    if (activeEl === el) return;
    if (activeEl) {
      activeEl.classList.remove('acesslens-focused');
      activeEl.classList.add('acesslens-blurred');
    }
    activeEl = el;
    if (activeEl) {
      activeEl.classList.remove('acesslens-blurred');
      activeEl.classList.add('acesslens-focused');
    }
  }

  function onGaze({ y }) {
    const target = findBlockUnderY(y);
    if (!target) return;

    if (target !== activeEl) {
      const now = performance.now();
      if (pendingEl !== target) {
        pendingEl = target;
        pendingSince = now;
      } else if (now - pendingSince >= DWELL_MS) {
        setActive(target);
        pendingEl = null;
      }
    } else {
      pendingEl = null;
    }
  }

  function start() {
    injectStyles();
    rescanCandidates();
    unsubscribe = window.__acesslens.gazeStream.subscribe(onGaze);
    mutationObserver = new MutationObserver(scheduleRescan);
    mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (rescanTimer) {
      clearTimeout(rescanTimer);
      rescanTimer = null;
    }
    for (const el of candidates) {
      el.classList.remove('acesslens-blurred', 'acesslens-focused');
    }
    candidates = new Set();
    activeEl = null;
    pendingEl = null;
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  }

  window.__acesslens = window.__acesslens || {};
  window.__acesslens.gazeFocus = { start, stop };
})();
