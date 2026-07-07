import { chromium } from 'playwright';
import path from 'path';

const EXTENSION_PATH = path.resolve('test-build');
const USER_DATA_DIR = path.resolve('.pw-profile-workflow');
const SCRATCH = 'C:\\Users\\azeem\\AppData\\Local\\Temp\\claude\\d--AcessLens\\85e5dcf8-d446-4646-88a8-3332833d80b3\\scratchpad\\';

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
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

const page = await context.newPage();
page.on('console', (msg) => console.log(`[page] ${msg.type()}: ${msg.text()}`));
page.on('pageerror', (err) => console.log(`[page ERROR] ${err.message}`));

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

console.log('--- STEP 1: Navigate to the AcessLens frontend (no content uploaded yet) ---');
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

console.log('--- STEP 2: Turn tracking ON *before* any PDF is uploaded (the realistic/riskier order) ---');
await injectOnCurrentTab();
await page.waitForTimeout(3000);

const overlayVisible = await page.locator('#acesslens-calibration-overlay').isVisible().catch(() => false);
console.log('Calibration overlay visible:', overlayVisible);

if (overlayVisible) {
  console.log('--- Clicking all 9 calibration dots x5 ---');
  const dots = await page.locator('#acesslens-calibration-overlay button').all();
  for (const dot of dots) {
    for (let i = 0; i < 5; i++) await dot.click({ force: true });
  }
  await page.waitForTimeout(800);
}

console.log('--- STEP 3: NOW upload a real PDF through the frontend (content appears after tracking is on) ---');
await page.setInputFiles('input[type="file"]', SCRATCH + 'attention.pdf');
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('/ingest'), { timeout: 30000 }),
  page.getByRole('button', { name: 'Submit' }).click(),
]);
console.log('Ingest response status:', resp.status());
await page.waitForTimeout(1000);

const cardCount = await page.locator('article[data-block-id]').count();
console.log('Reading cards rendered:', cardCount);

console.log('--- STEP 4: Confirm gazeFocus picked up the newly-added cards via MutationObserver ---');
await page.waitForTimeout(600); // let the debounced rescan fire
const candidateInfo = await page.evaluate(() => ({
  blurred: document.querySelectorAll('.acesslens-blurred').length,
  focused: document.querySelectorAll('.acesslens-focused').length,
}));
console.log('Candidate blocks found after upload (should be > 0 if rescan worked):', candidateInfo);

await page.screenshot({ path: SCRATCH + 'workflow_1_cards_blurred.png', fullPage: true });

console.log('--- STEP 5: Simulate a real gaze point landing on the second reading card ---');
const secondCard = page.locator('article[data-block-id]').nth(1);
const cardBox = await secondCard.boundingBox();
if (cardBox) {
  const gazePoint = { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 };
  for (let i = 0; i < 6; i++) {
    await page.evaluate((point) => window.__acesslens.gazeStream.debugEmit(point), gazePoint);
    await page.waitForTimeout(80);
  }
  const afterGaze = await page.evaluate(() => ({
    blurred: document.querySelectorAll('.acesslens-blurred').length,
    focused: document.querySelectorAll('.acesslens-focused').length,
    focusedBlockId: document.querySelector('.acesslens-focused')?.closest('[data-block-id]')?.getAttribute('data-block-id') || null,
  }));
  console.log('After gaze on 2nd card:', afterGaze);
  await page.screenshot({ path: SCRATCH + 'workflow_2_card_focused.png', fullPage: true });
} else {
  console.log('!!! Could not get bounding box for second card');
}

await context.close().catch(() => {});
