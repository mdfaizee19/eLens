# AcessLens — handoff guide for Mervin

This repo has three parts. Read this fully before touching code — it tells you
exactly what's verified working, what's a known gap, and what to do about
each one.

```
backend/    FastAPI service - PDF/URL/text extraction -> structured reading cards
frontend/   React app - upload UI + a PDF.js-based /pdf-viewer route
extension/  Chrome extension (MV3) - webcam gaze tracking, enlarge/blur effect
```

The end product: a person opens a PDF or webpage, turns on the AcessLens
extension, and whatever paragraph they're looking at enlarges and sharpens
while everything else blurs, continuously, as their eyes move down the page.
No upload step, no separate app to switch to.

## Current status — what's actually verified vs. what isn't

**Verified working** (real automated tests, screenshots taken, not guesses):
- Backend: all three input modes (file/url/text), OCR fallback for scanned
  PDFs, structured error responses, CORS.
- Frontend: upload UI, error rendering, card rendering with front-loaded
  emphasis, self-hosted fonts.
- Extension: toolbar toggle, 9-point calibration, calibration persistence,
  the enlarge/blur effect itself — confirmed end-to-end on a real PDF
  (right-click a PDF link → opens in the frontend's `/pdf-viewer` → turn on
  tracking → calibrate → the page under your gaze enlarges, others blur).

**Not verified — this is the most important gap, fix this first**:
Every gaze-tracking test so far used Chromium's `--use-fake-device-for-media-stream`
flag (a synthetic fake camera with no face in it), because the automated
test environment has no real webcam. This proved the *pipeline* works
(calibration overlay renders, clicks register, the enlarge/blur logic
switches correctly when fed a real coordinate) — it has **not** proven
WebGazer's actual gaze-prediction accuracy with a real human face. That can
only be tested by an actual person, on an actual webcam, actually reading.
**Do this before anything else below.** Load the extension (see "Run it
locally" below), sit in front of your webcam, calibrate, and read a real
page. If the enlarge/blur effect tracks your eyes in a way that's actually
useful (not just technically firing), the core premise is validated. If
accuracy is poor, that's a WebGazer tuning problem (lighting, camera
resolution, more calibration points), not an architecture problem.

## Architecture, and why it's shaped this way

Three findings drove the current structure — know these before you change
anything, or you'll re-break things that took real debugging to fix:

1. **Chrome's built-in PDF viewer doesn't expose PDF text as real DOM.**
   Confirmed by direct inspection: `document.body` came back essentially
   empty even with a PDF plainly visible on screen. The extension's overlay
   UI (calibration, gaze dot) still renders fine on top of it, but the
   enlarge/blur effect has nothing to select — there's no `<p>`, no `<span>`,
   nothing. This is a hard platform limitation, not a bug.

2. **A sandboxed extension page can't use the webcam.** I initially tried
   rendering the PDF inside the extension itself (`chrome-extension://`
   page), which needs a `"sandbox"` CSP relaxation to let WebGazer's
   dependency chain use `eval()` (plain MV3 extension pages can never allow
   eval, full stop, no manifest override exists). But sandboxed pages have
   an **opaque origin**, and `getUserMedia()` structurally requires a
   stable origin to grant camera permission to — confirmed by the exact
   browser error `Invalid security origin`. So: normal extension page → eval
   blocked. Sandboxed extension page → camera blocked. No single
   `chrome-extension://` context satisfies both at once.

3. **The fix: host the PDF viewer as a real web page.** `frontend/src/PdfViewerPage.jsx`
   renders PDFs with PDF.js (real text layer, real DOM), served from
   `frontend`'s own real http(s) origin — which has neither restriction (normal
   websites allow eval by default, and have a real origin for camera
   permission). The extension's "Open with AcessLens" right-click menu just
   navigates to `<frontend-url>/pdf-viewer?file=<pdf-url>` instead of an
   internal extension page. The existing, already-proven content-script
   injection (toolbar toggle) then works on it exactly like any other webpage.

This means **the extension depends on the frontend being reachable** for the
PDF-reading use case specifically (not for the general "enlarge/blur any
webpage" case, which needs nothing but the extension itself). Keep this
dependency in mind for deployment — see below.

## Requirements to run this on your PC

Install these before doing anything else:

| Requirement | Version used/confirmed working | Why |
|---|---|---|
| **Python** | 3.14.5 | Backend (FastAPI, pdfplumber, spaCy, OCR fallback) |
| **Node.js + npm** | Node v22.19.0 / npm 10.9.3 | Frontend (Vite/React) and extension tooling |
| **Tesseract OCR** | v5.4.0.20240606 (Windows build from UB-Mannheim, mirrored on their GitHub releases since the direct download host can 403 non-browser requests) | Backend's OCR fallback for scanned/image-only PDFs |
| **Poppler** (`pdftoppm`/`pdftocairo`) | v24.08.0 (portable Windows build, e.g. `oschwartz10612/poppler-windows` releases) | Backend's OCR fallback rasterizes PDF pages via this before running Tesseract |
| **Google Chrome** | any recent version (Manifest V3 support required) | Loading/running the extension — needs Developer mode enabled in `chrome://extensions` |
| **A webcam** | any | Required for the extension to do anything at all — WebGazer needs a real camera feed |
| **git** | any recent version | Cloning/managing this repo |

Platform notes:
- This was built and tested on **Windows**. Linux/Mac should work the same
  way for backend/frontend (adjust `.venv/Scripts/activate` to
  `.venv/bin/activate`), but Tesseract/Poppler install differently — see
  `backend/README.md` for the `apt`/`brew` commands instead of the Windows
  installer approach.
- On Windows, if Tesseract/Poppler aren't on your `PATH`, set the
  `TESSERACT_CMD` and `POPPLER_PATH` environment variables to their install
  locations before starting the backend (see `backend/README.md`).
- No GPU is required anywhere in this stack.

## Run it locally

**Backend** (needs Python, `tesseract-ocr` + `poppler-utils` installed and on
PATH, or set `TESSERACT_CMD`/`POPPLER_PATH` env vars):
```
cd backend
python -m venv .venv && source .venv/Scripts/activate   # or .venv/bin/activate on Linux/Mac
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn app.main:app --port 8000
```

**Frontend** (needs Node):
```
cd frontend
npm install
npm run dev -- --port 5173
```

**Extension**:
1. `chrome://extensions` → enable Developer mode → Load unpacked →
   select `extension/public`.
2. Click the AcessLens toolbar icon on any page, allow camera, calibrate.
3. To test the PDF flow: right-click any link ending in `.pdf` → "Open with
   AcessLens" (frontend must be running on `localhost:5173` for this —
   see the hardcoded URL note below).

All three need to be running simultaneously for the full PDF flow to work.

## Known gaps to fix, in priority order

1. **`FRONTEND_PDF_VIEWER_URL` is hardcoded** in
   `extension/public/background.js` to `http://localhost:5173/pdf-viewer`.
   Once the frontend has a real deployment URL, update this constant (and
   rebuild/reload the unpacked extension, or bump the version and republish
   if already on the Web Store).

2. **CORS will break real-world PDF links.** The frontend's `/pdf-viewer`
   fetches the target PDF directly via `fetch()` from the browser — subject
   to normal CORS rules. Many real PDF hosts (news sites, internal company
   docs, etc.) don't send `Access-Control-Allow-Origin` headers, so the
   fetch will fail with a CORS error exactly like it did in my local testing
   before I added CORS headers to my test server. **Fix**: add a proxy
   endpoint to the backend (e.g. `GET /proxy-pdf?url=...` that fetches the
   PDF server-side, where CORS doesn't apply, and streams the bytes back)
   and have `PdfViewerPage.jsx` fetch through that instead of hitting the
   target URL directly. This is a real, not-yet-built piece — don't skip it,
   the feature will silently fail on most real-world PDFs without it.

3. **WebGazer.js is GPL-3.0** (LGPL-3.0 exception for companies valued under
   $1M — see `extension/node_modules/webgazer/package.json` / its
   `dist/webgazer.js` header comment). If this extension is ever actually
   published/distributed, someone needs to make a real licensing call
   before that happens. Don't let this slide silently.

4. **No extension icons.** `manifest.json` has no `icons` field — required
   for a real Chrome Web Store listing (Chrome will show a generic
   puzzle-piece icon otherwise, unprofessional for a real release). Needs a
   16/48/128px icon set added to `extension/public/icons/` and referenced in
   the manifest.

5. **No privacy policy.** Chrome Web Store requires one for any extension
   requesting camera access, non-negotiable for publishing. Needs to
   explicitly state: webcam frames are processed locally by WebGazer for
   gaze prediction, calibration data (eye-patch images) is stored in
   `chrome.storage.local` and never transmitted anywhere. Write this before
   attempting to submit to the Web Store.

6. **Frontend bundle is 574KB** (`pdfjs-dist` pulled into the main bundle,
   flagged by `npm run build`'s chunk-size warning). Not broken, but worth
   fixing before a real deployment: dynamic-`import()` the `PdfViewerPage`
   component and/or `pdfjs-dist` so the main app bundle doesn't carry PDF.js
   weight for users who never open the PDF viewer.

7. **Local `file:///something.pdf` links** need the user to manually enable
   "Allow access to file URLs" for the extension in `chrome://extensions` →
   Details. This is a Chrome-enforced, per-extension user toggle — there's
   no way to enable it programmatically. Document this for end users if
   local-file PDFs matter for your use case.

8. **Hardcoded tuning constants** in `extension/public/content/gazeFocus.js`
   (`DWELL_MS = 150`, blur `3px`, enlarge `scale(1.15)`) and
   `calibrationOverlay.js` (`CLICKS_PER_POINT = 5`, 9-point grid). These are
   reasonable defaults but not user-adjustable. If real-webcam testing (see
   top of this doc) shows the effect is too jumpy, too slow to switch, or
   too subtle/aggressive visually, tune these first before assuming
   something is architecturally wrong.

## Deployment

**Backend**: needs a real host with `tesseract-ocr` and `poppler-utils`
installed at the OS level (this is the part most likely to be forgotten —
`pip install -r requirements.txt` alone is not enough, see
`backend/README.md`). Run behind a real ASGI server setup (e.g. `uvicorn`
with multiple workers behind a reverse proxy, or a managed Python host).
Update the CORS origins in `backend/app/main.py`'s `CORSMiddleware` config
to include your deployed frontend's real origin, not just
`localhost:5173`.

**Frontend**: `npm run build` produces `frontend/dist/` — deploy as a static
site (Vercel, Netlify, S3+CloudFront, whatever). Two things to get right:
- Set `VITE_API_BASE_URL` at build time to point at your deployed backend
  (defaults to `localhost:8000` otherwise — see `frontend/src/lib/api.js`).
- The `/pdf-viewer` route needs your host to serve `index.html` for
  non-file paths (SPA fallback). Vite's dev server does this automatically;
  most static hosts need an explicit rewrite rule (e.g. Vercel's
  `vercel.json` rewrites, Netlify's `_redirects` file) — without it,
  navigating directly to `/pdf-viewer` will 404 in production even though it
  works in dev.

**Extension**: for real distribution, package `extension/public` for the
Chrome Web Store:
1. Fix items 3 (licensing) and 5 (privacy policy) above first — the Web
   Store review will reject a camera-access extension without a privacy
   policy.
2. Add icons (item 4 above).
3. Update `FRONTEND_PDF_VIEWER_URL` to your production frontend URL (item 1).
4. Zip the `extension/public` directory contents (not the folder itself) and
   submit via the Chrome Web Store Developer Dashboard. There's a one-time
   $5 developer registration fee.
5. Alternatively, for internal/limited distribution without a public Web
   Store listing, use Chrome's enterprise policy deployment or just share
   the unpacked folder + "Load unpacked" instructions for a small trusted
   group — no store review needed for that path.

## Testing checklist before calling this done

- [ ] Real human, real webcam, real calibration — confirm accuracy is
      actually usable (see top of doc)
- [ ] Backend proxy for PDF fetching (item 2) — test against a real
      external PDF URL that doesn't have permissive CORS
- [ ] Update the hardcoded frontend URL (item 1) once deployed
- [ ] Licensing decision made and documented (item 3)
- [ ] Privacy policy written (item 5)
- [ ] Extension icons added (item 4)
- [ ] Test the SPA fallback works on your actual static host (item under
      Deployment → Frontend)
- [ ] Test on at least one real PDF hosted on a domain you don't control
      (news article PDF, government form, etc.) end-to-end
