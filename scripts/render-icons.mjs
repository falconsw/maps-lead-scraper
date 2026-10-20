// Renders icons/icon.svg to the PNG sizes the manifest and the Chrome Web Store need.
// Usage: CHROME_PATH=/path/to/chrome node scripts/render-icons.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../extension/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

// The store wants 128px icons with the artwork in the middle 96px; toolbar sizes use the full square.
const targets = [
  { size: 16, art: 16 },
  { size: 32, art: 32 },
  { size: 48, art: 48 },
  { size: 128, art: 96 },
];
for (const { size, art } of targets) {
  // A fresh page per size: resizing one page between shots left stale tiles in the 128px render.
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const pad = (size - art) / 2;
  const sized = svg.replace('<svg ', `<svg width="${art}" height="${art}" `);
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;margin:${pad}px}</style>${sized}`);
  await page.screenshot({ path: new URL(`../extension/icons/icon${size}.png`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons rendered');
