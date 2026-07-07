# AcessLens Gaze Reader — how to run it and see it work

This is a Chrome extension: webcam eye-tracking (via WebGazer.js) that enlarges
whatever paragraph you're looking at and blurs everything else, updating
continuously as your gaze moves down the page. Built for low-vision /
dyslexic readers.

## Load it in Chrome (one-time setup)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `d:\AcessLens\extension\public` folder
5. You'll see "AcessLens Gaze Reader" appear with a toolbar icon

## Turn tracking on

1. Go to any regular web page with real paragraphs of text (a news article,
   Wikipedia, etc.) — **not** a PDF opened directly in Chrome, see the
   limitation section below for why.
2. Click the AcessLens toolbar icon.
3. Chrome will ask for camera permission — allow it.
4. A full-screen calibration overlay appears: 9 red dots. **Click each dot 5
   times while looking directly at it.** Dots turn green as you finish them.
5. Once all 9 are done, the overlay disappears and a small pink dot appears
   that follows your tracked gaze. As you read down the page, the paragraph
   your gaze lands on enlarges and sharpens; everything else blurs.
6. Click the toolbar icon again to turn tracking off for that tab.
7. Click the toolbar icon's popup → **Recalibrate** any time accuracy drifts
   (different lighting, moved your webcam, etc.). Your calibration is saved
   (`chrome.storage.local`) so you don't have to redo it every new tab —
   only when you explicitly click Recalibrate.

## The actual limitation you need to know about: real PDFs in Chrome's built-in viewer

**I tested this directly and confirmed it, so I'm telling you straight
instead of letting you find out the hard way.**

When you open a PDF directly in Chrome (`file:///something.pdf` or a PDF
URL), Chrome renders it through its own built-in PDF viewer. I loaded a real
PDF, injected the extension, and inspected the page's DOM directly:
`document.body` came back essentially empty (`bodyChildCount: 0`), even
though the PDF text is clearly visible on screen. Chrome renders the actual
PDF content through an internal mechanism that isn't exposed as normal,
queryable HTML elements — there's no `<p>`, `<span>`, or any real text node
for a content script to find.

Concretely, this means:
- The calibration overlay and gaze dot **do** show up fine on top of a
  Chrome-viewed PDF (they're just floating DOM elements appended on top,
  confirmed with a screenshot — screenshot below).
- But the enlarge/blur effect has **nothing to grab onto** on that PDF's
  actual text, because there's no real paragraph element there to select.
  It will find zero candidate blocks and do nothing to the PDF content
  itself.

This is not a bug I can fix by writing more content-script code — it's how
Chrome's PDF viewer is architected (PDF content isn't real DOM).

### What actually works for PDFs

The AcessLens **web app** (`d:\AcessLens\frontend`, already built and
running against the backend at `d:\AcessLens\backend`) solves exactly this:
it sends the PDF to the backend, which extracts real text and returns it as
structured reading cards — genuine `<p>` elements in genuine DOM. Open a PDF
through **that** app (upload it in the "File" tab), turn on AcessLens
tracking on that page, and the enlarge/blur effect works on it the same way
it works on any other real web page — because at that point it *is* a real
web page with real paragraphs, not Chrome's opaque PDF renderer.

So: for a live demo reading a PDF with the eye-tracking effect, use
`localhost:5173` (the AcessLens frontend) with a PDF uploaded through it —
not a PDF opened directly in a Chrome tab.

## Screenshots from actual test runs (not mockups)

- Calibration overlay on a real webpage: working, 9-point grid, click-to-fill.
- After calibration + a real gaze point: the paragraph under the gaze point
  enlarges and sharpens, the other 3 paragraphs blur — verified with a
  synthetic gaze point (real WebGazer predictions need an actual human face
  in front of a webcam, which an automated test environment doesn't have;
  the enlarge/blur switching logic itself was verified directly and works).
- Calibration overlay rendering on top of a real PDF in Chrome's viewer:
  confirmed the overlay shows up, and confirmed separately that the
  underlying PDF text is not accessible DOM content.

## Known rough edges (being upfront, not hiding them)

- **WebGazer.js is GPL-3.0** (with an LGPL-3.0 exception for companies
  valued under $1M). If this ever ships for real distribution, that
  licensing needs a real decision — not something to gloss over.
- Calibration accuracy depends entirely on lighting and webcam quality —
  it's WebGazer's own model, not something this project controls.
- The `enlarge` effect uses CSS `transform: scale()` + `filter: blur()` on
  whatever block-level element (`p`, `li`, `h1-h6`, `blockquote`, `td`, `dt`,
  `dd`) the gaze lands nearest to. Very short or very densely-packed text
  blocks may not isolate as cleanly as the test paragraphs did.

## Architecture note (only matters if you're touching the code)

WebGazer must run in the page's **MAIN** JS world, not the isolated world
content scripts get by default — its mediapipe/WASM asset loader breaks
under isolated-world injection (confirmed by direct testing: identical code
works when loaded as a normal `<script>` tag, and fails identically when
injected via `chrome.scripting.executeScript` without `world: 'MAIN'`).
Since `chrome.storage`/`chrome.runtime` are *only* available in the isolated
world, there's a small bridge file (`content/isolatedBridge.js`, isolated
world) that talks to the WebGazer-owning script (`content/mainWorld.js`,
main world) via plain DOM `CustomEvent`s. If you're adding new
chrome.-API-dependent features, they belong in the isolated bridge, not in
the main-world files.
