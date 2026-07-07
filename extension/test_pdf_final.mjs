import { chromium } from 'playwright';
import path from 'path';

const EXTENSION_PATH = path.resolve('test-build');
const SCRATCH = 'C:\\Users\\azeem\\AppData\\Local\\Temp\\claude\\d--AcessLens\\85e5dcf8-d446-4646-88a8-3332833d80b3\\scratchpad\\';

const context = await chromium.launchPersistentContext(path.resolve('.pw-profile-pdffinal'), {
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

let [background] = context.serviceWorkers();
if (!background) background = await context.waitForEvent('serviceworker');
background.on('console', (msg) => console.log(`[background] ${msg.type()}: ${msg.text()}`));

console.log('--- STEP 1: Simulate "Open with AcessLens" context-menu click on a real PDF link ---');
const pdfUrl = 'http://localhost:8899/attention.pdf';
// This is exactly what background.js's chrome.contextMenus.onClicked does.
const viewerUrl = await background.evaluate((pdfUrl) => {
  return 'http://localhost:5173/pdf-viewer' + '?file=' + encodeURIComponent(pdfUrl);
}, pdfUrl);
console.log('Viewer URL:', viewerUrl);

const page = await context.newPage();
page.on('console', (msg) => console.log(`[page] ${msg.type()}: ${msg.text()}`));
page.on('pageerror', (err) => console.log(`[page ERROR] ${err.message}`));

await page.goto(viewerUrl, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

const pageCount = await page.locator('.pdf-page').count();
console.log('STEP 1 RESULT: real PDF pages rendered on a real web origin:', pageCount);
const textSample = await page.evaluate(() => document.querySelector('.textLayer')?.textContent?.slice(0, 100));
console.log('Real extracted text sample:', textSample);
await page.screenshot({ path: SCRATCH + 'final_1_pdf_on_real_origin.png' });

console.log('--- STEP 2: Turn on gaze tracking (same toggle flow already proven on regular pages) ---');
async function injectOnCurrentTab() {
  const [tab] = await background.evaluate(async () => {
    return await chrome.tabs.query({ active: true, currentWindow: true });
  });
  await background.evaluate(async (tabId) => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/isolatedBridge.js'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'vendor/webgazer.js',
        'content/gazeStream.js',
        'content/calibrationOverlay.js',
        'content/gazeDot.js',
        'content/gazeFocus.js',
        'content/mainWorld.js',
      ],
      world: 'MAIN',
    });
  }, tab.id);
}
await injectOnCurrentTab();
await page.waitForTimeout(6000);

const debugState = await page.evaluate(() => ({
  hasWebgazer: !!window.webgazer,
  hasAcesslens: !!window.__acesslens,
  hasGazeFocus: !!(window.__acesslens && window.__acesslens.gazeFocus),
  textLayerCount: document.querySelectorAll('.textLayer').length,
}));
console.log('Debug state after injection:', debugState);

const overlayVisible = await page.locator('#acesslens-calibration-overlay').isVisible().catch(() => false);
console.log('Calibration overlay visible:', overlayVisible);

if (overlayVisible) {
  const dots = await page.locator('#acesslens-calibration-overlay button').all();
  for (const dot of dots) {
    for (let i = 0; i < 5; i++) await dot.click({ force: true });
  }
  await page.waitForTimeout(800);
}

const focusInfo = await page.evaluate(() => ({
  blurred: document.querySelectorAll('.acesslens-blurred').length,
  focused: document.querySelectorAll('.acesslens-focused').length,
}));
console.log('STEP 2 RESULT: candidate PDF pages found by gazeFocus (via .textLayer):', focusInfo);
await page.screenshot({ path: SCRATCH + 'final_2_tracking_on.png' });

console.log('--- STEP 3: Simulate real gaze landing on the second PDF page ---');
const secondPage = page.locator('.pdf-page').nth(1);
if ((await secondPage.count()) > 0) {
  await secondPage.scrollIntoViewIfNeeded();
  const box = await secondPage.boundingBox();
  const gazePoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let i = 0; i < 6; i++) {
    await page.evaluate((point) => window.__acesslens.gazeStream.debugEmit(point), gazePoint);
    await page.waitForTimeout(80);
  }
  const afterGaze = await page.evaluate(() => ({
    blurred: document.querySelectorAll('.acesslens-blurred').length,
    focused: document.querySelectorAll('.acesslens-focused').length,
  }));
  console.log('STEP 3 RESULT: after gaze on page 2:', afterGaze);
  await page.screenshot({ path: SCRATCH + 'final_3_page2_focused.png' });
}

await context.close().catch(() => {});
