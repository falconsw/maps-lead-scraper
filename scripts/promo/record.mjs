// Records a live Area sweep: raw screenshots for the store listing and screen
// recordings for the promo video, written to store/build/raw.
// Usage: CHROME_PATH=/path/to/chrome-for-testing node scripts/promo/record.mjs ["query"] [lat,lng,zoom]
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const extensionDir = `${root}extension`;
const out = `${root}store/build/raw`;
const query = process.argv[2] || 'coffee shops';
const [lat, lng, zoom] = (process.argv[3] || '41.0545,28.9905,15').split(',');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const ctx = await chromium.launchPersistentContext(`${out}/profile`, {
  executablePath: process.env.CHROME_PATH,
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--headless=new', `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--lang=en-US'],
  viewport: { width: 1400, height: 900 },
  recordVideo: { dir: `${out}/video`, size: { width: 1400, height: 900 } },
});
const worker = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;

const t0 = Date.now();
const timing = {};
const mark = (name) => (timing[name] = (Date.now() - t0) / 1000);

mark('mapsPage');
const maps = await ctx.newPage();
await maps.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},${zoom}z?hl=en`, { waitUntil: 'domcontentloaded' });
await maps.waitForSelector('div[role="feed"]', { timeout: 30000 });
await maps.waitForTimeout(2500);

mark('panelPage');
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 380, height: 900 });
await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
const call = (type, payload = {}) => panel.evaluate(([type, payload]) => chrome.runtime.sendMessage({ type, ...payload }), [type, payload]);

await call('panel:new-session');
await call('panel:set-mode', { mode: 'area', areaSize: 1 });
await panel.waitForTimeout(1500);
await maps.screenshot({ path: `${out}/maps-start.png` });
await panel.screenshot({ path: `${out}/panel-start.png` });

const [tab] = await panel.evaluate(() => chrome.tabs.query({ url: 'https://www.google.com/maps/*' }));
mark('sweepStart');
await call('panel:start', { tabId: tab.id, url: tab.url });

let snap;
let midShot = false;
while (Date.now() - t0 < 6 * 60_000) {
  await maps.waitForTimeout(1000);
  snap = (await call('panel:snapshot')).result;
  if (!midShot && snap.state.areaStep >= 4) {
    midShot = true;
    mark('midShot');
    await maps.screenshot({ path: `${out}/maps-mid.png` });
    await panel.screenshot({ path: `${out}/panel-mid.png` });
  }
  if (!snap.state.running) break;
}
mark('sweepEnd');
await maps.waitForTimeout(2000);
await maps.screenshot({ path: `${out}/maps-end.png` });
await panel.screenshot({ path: `${out}/panel-end.png` });

await panel.getByRole('button', { name: 'No web' }).click();
await panel.waitForTimeout(500);
await panel.screenshot({ path: `${out}/panel-filter.png` });
await panel.getByRole('button', { name: 'All', exact: true }).click();
await panel.getByRole('button', { name: 'History' }).click();
await panel.waitForTimeout(800);
await panel.screenshot({ path: `${out}/panel-history.png` });
mark('done');

const places = (await call('panel:places', { sessionId: snap.session.id })).result;
writeFileSync(`${out}/places.json`, JSON.stringify(places, null, 1));
writeFileSync(`${out}/run.json`, JSON.stringify({ query, timing, stats: snap.stats }, null, 1));

const mapsVideo = maps.video();
const panelVideo = panel.video();
await ctx.close();
renameSync(await mapsVideo.path(), `${out}/maps.webm`);
renameSync(await panelVideo.path(), `${out}/panel.webm`);
console.log(JSON.stringify({ timing, stats: snap.stats }));
