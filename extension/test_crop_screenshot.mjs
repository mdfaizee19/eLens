import { chromium } from 'playwright';
import path from 'path';

const EXTENSION_PATH = path.resolve('test-build');
const SCRATCH = 'C:\\Users\\azeem\\AppData\\Local\\Temp\\claude\\d--AcessLens\\85e5dcf8-d446-4646-88a8-3332833d80b3\\scratchpad\\';

const context = await chromium.launchPersistentContext(path.resolve('.pw-profile-crop'), {
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

const page = await context.newPage();
page.on('console', () => {});

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

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await injectOnCurrentTab();
await page.waitForTimeout(3000);

const dots = await page.locator('#acesslens-calibration-overlay button').all();
for (const dot of dots) {
  for (let i = 0; i < 5; i++) await dot.click({ force: true });
}
await page.waitForTimeout(500);

await page.setInputFiles('input[type="file"]', SCRATCH + 'attention.pdf');
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/ingest'), { timeout: 30000 }),
  page.getByRole('button', { name: 'Submit' }).click(),
]);
await page.waitForTimeout(1000);

const secondCard = page.locator('article[data-block-id]').nth(1);
await secondCard.scrollIntoViewIfNeeded();
const cardBox = await secondCard.boundingBox();
const gazePoint = { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 };
for (let i = 0; i < 6; i++) {
  await page.evaluate((point) => window.__acesslens.gazeStream.debugEmit(point), gazePoint);
  await page.waitForTimeout(80);
}

// Viewport-only screenshot (not fullPage) so we can actually see the effect
await page.screenshot({ path: SCRATCH + 'workflow_3_viewport_focused.png' });

await context.close().catch(() => {});
