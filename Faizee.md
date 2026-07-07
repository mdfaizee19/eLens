# Work completed by Faizee

This documents what was designed, built, and verified across the three parts
of AcessLens. Everything listed as "verified" was actually tested against a
live, running system — real HTTP requests, real files, real screenshots —
not just written and assumed to work. See `Mervin.md` for what's left before
this is fully deployment-ready.

## Backend (`backend/`)

Built a FastAPI service exposing one endpoint, `POST /ingest`, that accepts
a PDF file, a URL, or pasted text and returns structured "reading cards" —
title, word-count-balanced blocks of ~30-70 words, sentence-level breakdown.

- **Three input modes**, one Contract-1-shaped JSON response for all of them.
- **PDF text extraction** via pdfplumber, with a hand-tuned `x_tolerance`
  fix for a real bug found in testing: LaTeX-generated academic PDFs (tested
  against the actual "Attention Is All You Need" arXiv paper) were coming
  out with words glued together ("Providedproperattributionisprovided") —
  traced to pdfplumber's default word-spacing heuristic, fixed and confirmed
  clean output on the same PDF.
- **Running footer/header removal**: found and fixed a real bug where
  running titles/page numbers on Beamer-slide PDFs and page footers on
  papers were being folded into sentence content. Built a line-position
  based repeat-detector (reusing the same coordinate data already extracted
  for paragraph-break detection) that identifies text repeating at the same
  vertical position across most pages and excludes it, while correctly
  leaving one-time content (a title slide's actual title/author) alone —
  verified block-by-block on both a real academic PDF and a real Beamer
  slide deck.
- **OCR fallback** for scanned/image-only PDFs: pdfplumber extraction runs
  first and returns immediately if it finds real text (zero added latency,
  measured and confirmed); only when that comes back empty does it fall
  back to Tesseract + pdf2image rasterization. Includes a page-count cap,
  a total-timeout, and per-page failure isolation (one corrupted page
  doesn't fail the whole request — confirmed with a deliberately-broken
  page injected into a real multi-page document, request still completed
  with the other pages' text and a `warnings` field explaining what was
  missing).
- **Word-count-based paragraph grouping**: rewrote the block-segmentation
  logic so blocks target 30-70 words based on an independent word-count
  pass, not just wherever the source PDF/URL happened to put a line break —
  fixing an earlier bug where a PDF with no blank-line breaks in its
  extracted text produced one giant per-page block instead of real
  paragraph-sized chunks.
- **Structured error handling**: fixed three real bugs found by direct
  testing, not assumption — a zero-page PDF and a corrupted/non-PDF upload
  were both returning unhandled 500s (now clean 422s with specific
  messages), and a PDF with no extractable text on any path (not even OCR)
  was silently returning `200` with an empty card list (now a proper 422).
- **CORS**: verified with an actual cross-origin `curl` request and a real
  headless-browser round-trip (not just reading the config) that
  `Access-Control-Allow-Origin` is present and correct for the frontend's
  origin, including the preflight `OPTIONS` request.

## Frontend (`frontend/`)

Built the React app that talks to the backend and renders the reading
experience.

- **Upload UI** with three modes (file / URL / paste text) in a segmented
  control, posting to the backend per Contract 1.
- **Error rendering**: backend's specific `detail` messages are shown to the
  user directly, not a generic "something went wrong" — verified live for
  both a 400 (empty input) and a 422 (unreachable URL).
- **`warnings` array rendering**: when the backend reports a partial OCR
  result, that's surfaced visibly in the UI, not silently dropped for being
  an optional field.
- **Card rendering** matching Contract 1's real shape (`id`, `order`,
  `sentences[].index/.text`).
- **Self-hosted fonts**: Atkinson Hyperlegible and OpenDyslexic, both
  downloaded as real `.woff2` files (verified by checking the `wOF2` file
  signature, not just trusting the download) and served from
  `frontend/public/fonts/` — zero CDN dependency, with a font-choice toggle
  in the UI.
- **Front-loaded emphasis**: the word-emphasis transform (bold the leading
  ~40% of each word, skip words ≤3 characters), named "front-loaded
  emphasis" throughout — deliberately not "Bionic Reading," which is a
  registered trademark.
- **`ActiveBlockContext`**: built as a genuine no-op default (Contract 3) so
  the UI is fully functional with zero tracking code, ready for gaze-driven
  behavior to be wired in later without changing the contract.
- **`/pdf-viewer` route**: added later, once testing revealed that neither
  Chrome's native PDF viewer nor a sandboxed extension page could host a
  PDF with both real DOM text *and* webcam access at the same time (see
  the extension section below for why). This route renders PDFs with
  PDF.js — a real text layer, real DOM, on a real web origin — specifically
  so the extension's gaze effect has something to work with when reading a
  PDF. Verified end-to-end with a real PDF: 15 pages rendered, real
  extracted text confirmed present in the DOM.
- Full responsive check at two viewport widths, both confirmed via
  screenshots.

## Extension (`extension/`)

This is where most of the actual engineering happened — three separate
hard technical walls were hit and diagnosed by direct testing, not
assumption, before landing on the architecture that actually works.

- **WebGazer.js integration**, self-hosted (no CDN), with real face-mesh
  tracking via a bundled MediaPipe model.
- **Real bug #1 — mediapipe assets 404ing**: WebGazer's face-tracking model
  loader was resolving its WASM/data assets relative to the host page's
  origin instead of the extension's, breaking OCR-style face detection
  entirely. Fixed by explicitly pointing `webgazer.params.faceMeshSolutionPath`
  at the extension's own bundled asset path.
- **Real bug #2 — isolated-world injection breaks WebGazer**: content
  scripts inject into an isolated JS world by default; WebGazer's asset
  loader silently fails there in a way that doesn't happen in a normal
  `<script>` tag. Diagnosed by reproducing the exact failure in an isolated
  test page, then confirming the fix (`world: "MAIN"` in
  `chrome.scripting.executeScript`) resolved it. Since `chrome.storage`/
  `chrome.runtime` are *only* available in the isolated world, built a
  small message-passing bridge (`isolatedBridge.js` ↔ `mainWorld.js`) so
  calibration persistence still works despite WebGazer needing to live in a
  different JS world than the extension APIs.
- **Calibration**: a full-screen 9-point click calibration overlay, with the
  trained model persisted via `chrome.storage.local` (not WebGazer's own
  per-origin `localStorage`, which wouldn't follow a user from site to
  site) — including proper serialization of the raw eye-patch image data
  the regression model needs.
- **The actual enlarge/blur effect**: subscribes to a plain gaze-point
  pub-sub, finds whichever text block the gaze point lands nearest to,
  enlarges/sharpens it and blurs everything else, with a dwell threshold to
  avoid flicker. Verified with a real screenshot: a specific paragraph
  sharp, the other three blurred, gaze dot sitting right on it.
- **Real bug #3 — stale content on dynamic pages**: the block-scanning was
  a one-time snapshot at startup, which breaks the moment content loads
  *after* tracking is turned on — the exact real-world order of events
  (open the AcessLens frontend, turn on tracking, *then* upload a PDF).
  Fixed with a debounced `MutationObserver` and confirmed via a deliberately
  adversarial test: tracking turned on before any content existed, PDF
  uploaded afterward, candidate blocks correctly went from 0 to 112 the
  moment the real reading cards rendered.
- **The PDF architecture problem** — the deepest investigation of the whole
  project. In order:
  1. Confirmed Chrome's native PDF viewer exposes no real DOM text at all
     (checked directly: `document.body` was essentially empty with a PDF
     plainly visible on screen).
  2. Tried rendering PDFs inside the extension itself with PDF.js. Hit a
     CSP wall: WebGazer's dependency chain needs `eval()`, which plain MV3
     extension pages can never allow, with no manifest override possible.
  3. Worked around that with Chrome's documented "sandboxed page" mechanism
     (relaxed CSP, eval allowed) — only to hit a *second* wall: sandboxed
     pages have an opaque origin, and `getUserMedia()` structurally can't
     grant camera permission to an opaque origin (confirmed by the exact
     browser error, `Invalid security origin`).
  4. Recognized these two requirements (eval needs sandboxed, camera needs
     non-sandboxed) are mutually exclusive in a single extension-page
     context, and that the only context satisfying both simultaneously is
     a normal website — which is exactly what the frontend already is. So
     the PDF viewer moved to `frontend/src/PdfViewerPage.jsx`, and the
     extension's job became simpler: a right-click "Open with AcessLens"
     context menu that navigates there instead of rendering PDFs itself.
- **Full end-to-end verification of the real feature**: right-click a real
  PDF link → opens in the frontend's PDF.js viewer → turn on tracking from
  the toolbar → calibrate → gaze on the second page → confirmed exactly
  one page enlarges/sharpens while the other 14 blur, tracking the gaze
  point precisely. This is the actual product behavior that was asked for,
  proven working, not inferred from separate pieces tested in isolation.
- Cleaned up lint (excluded vendored third-party files from the linter
  instead of trying to "fix" third-party code) and confirmed both the
  frontend build and every extension JS file are syntactically clean.

## What I did not do

Documented in full in `Mervin.md` — briefly: never tested with a real human
face on a real webcam (only Chromium's synthetic fake-camera flag, which has
no face for WebGazer to detect), no CORS proxy for fetching arbitrary
real-world PDF URLs, no Chrome Web Store packaging (icons, privacy policy),
and no resolution on WebGazer's GPL-3.0 licensing for real distribution.
Those are Mervin's to pick up from here through deployment.
