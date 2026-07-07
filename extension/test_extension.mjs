import { chromium } from 'playwright';
import path from 'path';

const EXTENSION_PATH = path.resolve('test-build'); // test-only: broader host_permissions so Playwright (which can't click the real toolbar icon) can invoke the same injection logic. Shipped extension uses public/manifest.json (activeTab-only).
const USER_DATA_DIR = path.resolve('.pw-profile');

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream', // auto-grant camera permission prompt
  ],
});

context.on('console', (msg) => console.log(`[ctx console] ${msg.type()}: ${msg.text()}`));

// Find the service worker (background) to get the extension ID
let [background] = context.serviceWorkers();
if (!background) background = await context.waitForEvent('serviceworker');
const extensionId = background.url().split('/')[2];
console.log('EXTENSION ID:', extensionId);
background.on('console', (msg) => console.log(`[background] ${msg.type()}: ${msg.text()}`));

const page = await context.newPage();
page.on('console', (msg) => console.log(`[page] ${msg.type()}: ${msg.text()}`));
page.on('pageerror', (err) => console.log(`[page ERROR] ${err.message}`));
page.on('close', () => console.log('!!! PAGE CLOSED !!!'));
context.on('close', () => console.log('!!! CONTEXT CLOSED !!!'));

console.log('--- Navigating to a real-text test page ---');
await page.goto('http://localhost:8899/test_reading_page.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);

// Playwright can't literally click the browser-chrome toolbar icon, so this
// replicates exactly what background.js's chrome.action.onClicked handler
// does - same two executeScript calls, same file lists, same worlds.
async function toggleOnCurrentTab() {
  const [tab] = await background.evaluate(async () => {
    return await chrome.tabs.query({ active: true, currentWindow: true });
  });
  console.log('Target tab:', tab.id, tab.url);
  const result = await background.evaluate(async (tabId) => {
    const ISOLATED_WORLD_FILES = ['content/isolatedBridge.js'];
    const MAIN_WORLD_FILES = [
      'vendor/webgazer.js',
      'content/gazeStream.js',
      'content/calibrationOverlay.js',
      'content/gazeDot.js',
      'content/gazeFocus.js',
      'content/mainWorld.js',
    ];
    const log = [];
    try {
      const r1 = await chrome.scripting.executeScript({ target: { tabId }, files: ISOLATED_WORLD_FILES });
      log.push('isolated injected: ' + JSON.stringify(r1.map((x) => ({ error: x.error, result: !!x.result }))));
    } catch (e) {
      log.push('isolated injection FAILED: ' + e.message);
    }
    try {
      const r2 = await chrome.scripting.executeScript({ target: { tabId }, files: MAIN_WORLD_FILES, world: 'MAIN' });
      log.push('main injected: ' + JSON.stringify(r2.map((x) => ({ error: x.error, result: !!x.result }))));
    } catch (e) {
      log.push('main injection FAILED: ' + e.message);
    }
    return log;
  }, tab.id);
  console.log('Injection result:', result);
}

const SCRATCH = 'C:\\Users\\azeem\\AppData\\Local\\Temp\\claude\\d--AcessLens\\85e5dcf8-d446-4646-88a8-3332833d80b3\\scratchpad\\';

console.log('--- Injecting gaze-tracking content script (simulating toolbar click) ---');
try {
  await toggleOnCurrentTab();
  await page.waitForTimeout(8000);

  console.log('--- Checking for calibration overlay ---');
  const overlayVisible = await page.locator('#acesslens-calibration-overlay').isVisible().catch(() => false);
  console.log('Calibration overlay visible:', overlayVisible);
  await page.screenshot({ path: SCRATCH + 'ext_1_calibration_overlay.png' });

  if (overlayVisible) {
    console.log('--- Clicking all 9 calibration dots x5 ---');
    const dots = await page.locator('#acesslens-calibration-overlay button').all();
    for (const dot of dots) {
      for (let i = 0; i < 5; i++) {
        await dot.click({ force: true });
      }
    }
    await page.waitForTimeout(1000);
  }

  const overlayGone = !(await page.locator('#acesslens-calibration-overlay').isVisible().catch(() => false));
  console.log('Calibration overlay dismissed after clicks:', overlayGone);
  await page.screenshot({ path: SCRATCH + 'ext_2_after_calibration.png' });

  console.log('--- Checking gaze dot + gazeFocus classes present ---');
  const dotPresent = await page.locator('#acesslens-gaze-dot').count();
  console.log('Gaze dot element present:', dotPresent > 0);

  const focusedOrBlurred = await page.evaluate(() => {
    const blurred = document.querySelectorAll('.acesslens-blurred').length;
    const focused = document.querySelectorAll('.acesslens-focused').length;
    return { blurred, focused };
  });
  console.log('Blur/focus class counts:', focusedOrBlurred);

  await page.screenshot({ path: SCRATCH + 'ext_3_gaze_effect.png', fullPage: true });

  // Real webgazer predictions require an actual face in front of a webcam,
  // which this sandboxed fake-camera environment doesn't have. To verify
  // the enlarge/blur switching logic itself (the code this project owns,
  // as opposed to WebGazer's face detection), feed synthetic gaze points
  // through the exact same gazeStream pub-sub webgazer would normally push
  // into, directly in the MAIN world.
  console.log('--- Simulating a synthetic gaze point over paragraph 2 ---');
  const p2Box = await page.locator('#p2').boundingBox();
  const gazePoint = { x: p2Box.x + p2Box.width / 2, y: p2Box.y + p2Box.height / 2 };
  // gazeFocus.js requires the gaze to dwell (150ms) on the same block across
  // multiple updates before switching, so emit repeatedly like a real
  // continuous gaze stream would.
  for (let i = 0; i < 6; i++) {
    await page.evaluate((point) => {
      window.__acesslens.gazeStream.debugEmit(point);
    }, gazePoint);
    await page.waitForTimeout(80);
  }

  const afterSynthetic = await page.evaluate(() => ({
    blurred: document.querySelectorAll('.acesslens-blurred').length,
    focused: document.querySelectorAll('.acesslens-focused').length,
    focusedId: document.querySelector('.acesslens-focused')?.id || null,
  }));
  console.log('After synthetic gaze over #p2:', afterSynthetic);
  await page.screenshot({ path: SCRATCH + 'ext_4_synthetic_gaze_focus.png', fullPage: true });
} catch (e) {
  console.log('!!! ERROR DURING TEST:', e.message, e.stack);
}

await context.close().catch(() => {});
