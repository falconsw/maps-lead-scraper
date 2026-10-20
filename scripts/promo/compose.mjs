// Builds the Chrome Web Store images and the promo video from the raw capture
// written by record.mjs. Text and layout are HTML rendered with Chrome; the
// video is assembled with the system ffmpeg (libx264).
// Usage: CHROME_PATH=/path/to/chrome-for-testing node scripts/promo/compose.mjs
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
const raw = `${root}store/build/raw`;
const build = `${root}store/build`;
const frames = `${build}/frames`;
const shots = `${root}store/screenshots`;
const REPO = 'github.com/falconsw/maps-lead-scraper';

rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
mkdirSync(shots, { recursive: true });

const run = JSON.parse(readFileSync(`${raw}/run.json`, 'utf8'));
const places = JSON.parse(readFileSync(`${raw}/places.json`, 'utf8')).sort((a, b) => a.capturedAt - b.capturedAt);
const img = (name) => `data:image/png;base64,${readFileSync(`${raw}/${name}`).toString('base64')}`;
const iconSvg = readFileSync(`${root}extension/icons/icon.svg`, 'utf8');
const icon = (size) => iconSvg.replace('<svg ', `<svg width="${size}" height="${size}" `);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const { total, noWebsite, phones } = run.stats;

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { position: relative; font-family: -apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif; color: #fff;
  background: radial-gradient(1100px 620px at 18% -10%, rgba(64, 120, 255, .55), transparent 62%),
              radial-gradient(900px 600px at 100% 110%, rgba(124, 77, 255, .45), transparent 60%),
              linear-gradient(135deg, #0d1430 0%, #1a1340 100%); }
body.clear { background: transparent; }
.h { font-weight: 750; letter-spacing: -0.035em; line-height: 1.08; }
.sub { color: rgba(255, 255, 255, .74); line-height: 1.4; }
.accent { background: linear-gradient(90deg, #6fa3ff, #b39bff); -webkit-background-clip: text; color: transparent; }
.window { position: absolute; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 40px 90px rgba(0, 0, 0, .5); }
.window .bar { height: 30px; background: #eef1f6; display: flex; align-items: center; gap: 7px; padding: 0 13px; }
.window .bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57; }
.window .bar i:nth-child(2) { background: #febc2e; } .window .bar i:nth-child(3) { background: #28c840; }
.window .body { display: flex; align-items: flex-start; background: #fff; }
.window img { display: block; }
.table { position: absolute; background: #fff; color: #1d2433; border-radius: 16px; overflow: hidden; box-shadow: 0 40px 90px rgba(0, 0, 0, .5); font-size: 15px; }
.table .title { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: #f3f6fb; font-weight: 650; }
.table .title b { color: #1a73e8; }
.table table { border-collapse: collapse; width: 100%; }
.table th { text-align: left; font-size: 12px; color: #6b7385; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; padding: 10px 18px; border-bottom: 1px solid #e4e8f0; }
.table td { padding: 10px 18px; border-bottom: 1px solid #eef1f6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
.pill { display: inline-block; padding: 9px 18px; border-radius: 999px; background: #1a73e8; color: #fff; font-weight: 650; font-size: 15px; }
.brand { display: flex; align-items: center; gap: 16px; }
.cards { display: grid; gap: 16px; }
.card { background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .14); border-radius: 16px; padding: 20px 22px; }
.card b { display: block; font-size: 21px; margin-bottom: 6px; }
.card span { color: rgba(255, 255, 255, .72); font-size: 16px; line-height: 1.4; }
`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function render(html, file, width, height, { clear = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><body class="${clear ? 'clear' : ''}">${html}</body>`, {
    waitUntil: 'load',
  });
  await page.screenshot({ path: file, omitBackground: clear });
  await page.close();
}

const browserWindow = (style, mapsShot, panelShot, mapsWidth) => {
  const panelWidth = Math.round((mapsWidth * 380) / 1400);
  return `<div class="window" style="${style}"><div class="bar"><i></i><i></i><i></i></div><div class="body">
    <img src="${img(mapsShot)}" style="width:${mapsWidth}px"><img src="${img(panelShot)}" style="width:${panelWidth}px"></div></div>`;
};

const panelWindow = (style, shot, width) =>
  `<div class="window" style="${style}"><div class="bar"><i></i><i></i><i></i></div><div class="body" style="background:#eef3ff">
    <img src="${img(shot)}" style="width:${width}px"></div></div>`;

const COLUMNS = {
  name: ['Name', (r) => r.name],
  category: ['Category', (r) => r.category],
  phone: ['Phone', (r) => r.phone || '—'],
  website: ['Website', (r) => r.domain || '—'],
  rating: ['Rating', (r) => r.rating ?? '—'],
};
const leadsTable = (style, rows, title, count, columns = ['name', 'category', 'phone', 'rating']) => `<div class="table" style="${style}">
  <div class="title"><span>${title}</span><b>${count}</b></div>
  <table><tr>${columns.map((c) => `<th>${COLUMNS[c][0]}</th>`).join('')}</tr>
  ${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(COLUMNS[c][1](r))}</td>`).join('')}</tr>`).join('')}
  </table></div>`;

const noWebRows = places.filter((p) => !p.website && p.phone).slice(0, 9);
const webRows = places.filter((p) => p.website && p.phone).slice(0, 10);

// ---------- Chrome Web Store screenshots (1280x800) ----------
await render(
  `<div style="position:absolute;top:58px;width:100%;text-align:center">
     <div class="h" style="font-size:48px">Sweep a whole area, <span class="accent">hands-free</span></div>
     <div class="sub" style="font-size:21px;margin-top:14px">Area sweep moves the map by itself and empties the results list at every spot.</div>
   </div>
   ${browserWindow('left:50px;top:200px;width:1180px', 'maps-mid.png', 'panel-mid.png', 928)}`,
  `${shots}/1-area-sweep.png`,
  1280,
  800,
);
await render(
  `<div style="position:absolute;left:60px;top:70px;width:560px">
     <div class="h" style="font-size:46px">Every business in <span class="accent">one clean list</span></div>
     <div class="sub" style="font-size:20px;margin-top:16px">Names, phones, websites, ratings, addresses and opening hours, deduplicated as you go.</div>
   </div>
   ${leadsTable('left:60px;top:270px;width:680px', webRows.slice(0, 9), `“${esc(run.query)}” · captured`, `${total} businesses`, ['name', 'phone', 'website', 'rating'])}
   ${panelWindow('right:60px;top:70px;width:400px', 'panel-end.png', 400)}`,
  `${shots}/2-every-business.png`,
  1280,
  800,
);
await render(
  `<div style="position:absolute;left:60px;top:70px;width:600px">
     <div class="h" style="font-size:46px">Spot businesses <span class="accent">without a website</span></div>
     <div class="sub" style="font-size:20px;margin-top:16px">${noWebsite} of ${total} had no website in this sweep. Filter them and export to CSV in one click.</div>
   </div>
   ${leadsTable('left:60px;top:280px;width:680px', noWebRows.slice(0, 8), 'Filter: No website', `${noWebsite} leads`)}
   <div style="position:absolute;left:60px;top:705px"><span class="pill">⤓ Export CSV</span></div>
   ${panelWindow('right:60px;top:70px;width:400px', 'panel-filter.png', 400)}`,
  `${shots}/3-no-website-leads.png`,
  1280,
  800,
);
await render(
  `<div style="position:absolute;left:60px;top:80px;width:640px">
     <div class="h" style="font-size:46px">Private and <span class="accent">open source</span></div>
     <div class="sub" style="font-size:20px;margin-top:16px">Everything happens inside Google Maps and your browser.</div>
     <div class="cards" style="margin-top:36px">
       <div class="card"><b>No account, no server</b><span>Results are stored locally in your browser. Nothing is sent anywhere.</span></div>
       <div class="card"><b>Stays on Google Maps</b><span>The extension only runs on Google Maps pages and never visits other sites.</span></div>
       <div class="card"><b>MIT licensed</b><span>Read every line on GitHub: ${REPO}</span></div>
     </div>
   </div>
   ${panelWindow('right:60px;top:80px;width:400px', 'panel-history.png', 400)}`,
  `${shots}/4-private-open-source.png`,
  1280,
  800,
);

// ---------- Promo tiles ----------
await render(
  `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 34px">
     <div class="brand">${icon(64)}<div class="h" style="font-size:31px">Maps Lead<br>Scraper</div></div>
     <div class="sub" style="font-size:17px;margin-top:18px">Sweep an area on Google Maps.<br>Export every business.</div>
   </div>`,
  `${root}store/promo-small-440x280.png`,
  440,
  280,
);
await render(
  `<div style="position:absolute;left:70px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center">
     <div class="brand">${icon(72)}<div class="h" style="font-size:38px">Maps Lead Scraper</div></div>
     <div class="h" style="font-size:44px;margin-top:26px">Sweep an area.<br><span class="accent">Export every business.</span></div>
     <div class="sub" style="font-size:19px;margin-top:16px">Free, open source, stays on Google Maps.</div>
   </div>
   ${browserWindow('left:640px;top:70px;width:900px', 'maps-mid.png', 'panel-mid.png', 707)}`,
  `${root}store/marquee-1400x560.png`,
  1400,
  560,
);

// ---------- Promo video frames (1920x1080) ----------
await render(
  `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
     ${icon(150)}
     <div class="h" style="font-size:96px;margin-top:34px">Maps Lead Scraper</div>
     <div class="sub" style="font-size:40px;margin-top:22px">Turn any Google Maps search into a lead list.</div>
   </div>`,
  `${frames}/intro.png`,
  1920,
  1080,
);
await render(
  `<div style="position:absolute;top:70px;width:100%;text-align:center">
     <div class="h" style="font-size:68px">Search on Google Maps, <span class="accent">press Start</span></div>
   </div>
   ${browserWindow('left:150px;top:230px;width:1620px', 'maps-start.png', 'panel-start.png', 1274)}`,
  `${frames}/step.png`,
  1920,
  1080,
);
await render(`<div></div>`, `${frames}/stage.png`, 1920, 1080);
const captions = ['Area sweep moves the map <span class="accent">by itself</span>', '…and empties the results list <span class="accent">at every spot</span>', `<span class="accent">${total} coffee shops</span> in under 3 minutes`];
for (const [i, text] of captions.entries()) {
  await render(
    `<div style="position:absolute;top:44px;width:100%;text-align:center" class="h"><span style="font-size:64px;text-shadow:0 4px 30px rgba(0,0,0,.4)">${text}</span></div>`,
    `${frames}/caption${i + 1}.png`,
    1920,
    170,
    { clear: true },
  );
}
const mask = (w, h, file) => render(`<div style="width:${w}px;height:${h}px;background:#fff;border-radius:18px"></div>`, file, w, h, { clear: true });
await mask(1360, 874, `${frames}/mask-maps.png`);
await mask(408, 874, `${frames}/mask-panel.png`);
await render(
  `<div style="position:absolute;top:70px;width:100%;text-align:center">
     <div class="h" style="font-size:68px">Filter and <span class="accent">export to CSV</span></div>
     <div class="sub" style="font-size:32px;margin-top:16px">${phones} with phone numbers · ${noWebsite} without a website</div>
   </div>
   ${leadsTable('left:150px;top:300px;width:1040px;font-size:21px', noWebRows, 'Filter: No website', `${noWebsite} leads`)}
   ${panelWindow('right:150px;top:300px;width:470px', 'panel-filter.png', 470)}`,
  `${frames}/export.png`,
  1920,
  1080,
);
await render(
  `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
     ${icon(130)}
     <div class="h" style="font-size:84px;margin-top:30px">Free &amp; <span class="accent">open source</span></div>
     <div class="sub" style="font-size:40px;margin-top:24px">${REPO}</div>
     <div class="sub" style="font-size:28px;margin-top:40px">Chrome extension · MIT licensed · Your data stays in your browser</div>
   </div>`,
  `${frames}/outro.png`,
  1920,
  1080,
);
await browser.close();

// ---------- Promo video ----------
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30'];
const still = (name, seconds) =>
  ff(['-loop', '1', '-t', String(seconds), '-i', `${frames}/${name}.png`, '-vf', `fade=t=in:st=0:d=0.5,fade=t=out:st=${seconds - 0.5}:d=0.5`, ...enc, `${frames}/${name}.mp4`]);

still('intro', 3.5);
still('step', 3);

// Both recordings share one clock (run.timing); trim them to the sweep and speed it up.
const SPEED = 5;
const { panelPage, sweepStart, sweepEnd } = run.timing;
const span = sweepEnd - sweepStart + 1.5;
const out = span / SPEED;
const third = out / 3;
ff([
  '-loop', '1', '-i', `${frames}/stage.png`,
  '-ss', String(sweepStart), '-t', String(span), '-i', `${raw}/maps.webm`,
  '-ss', String(sweepStart - panelPage), '-t', String(span), '-i', `${raw}/panel.webm`,
  '-loop', '1', '-i', `${frames}/mask-maps.png`,
  '-loop', '1', '-i', `${frames}/mask-panel.png`,
  '-loop', '1', '-i', `${frames}/caption1.png`,
  '-loop', '1', '-i', `${frames}/caption2.png`,
  '-loop', '1', '-i', `${frames}/caption3.png`,
  '-filter_complex',
  [
    `[1:v]setpts=(PTS-STARTPTS)/${SPEED},fps=30,scale=1360:874,format=rgba[m]`,
    `[3:v]format=gray[mm]`,
    `[m][mm]alphamerge[mr]`,
    // The panel recording holds the 380px-wide page in the top-left 380x813 of the frame.
    `[2:v]setpts=(PTS-STARTPTS)/${SPEED},fps=30,crop=380:813:0:0,scale=408:874,format=rgba[p]`,
    `[4:v]format=gray[pm]`,
    `[p][pm]alphamerge[pr]`,
    `[0:v][mr]overlay=66:180:shortest=1[a]`,
    `[a][pr]overlay=1446:180[b]`,
    `[b][5:v]overlay=0:0:enable='lt(t,${third})'[c]`,
    `[c][6:v]overlay=0:0:enable='between(t,${third},${2 * third})'[d]`,
    `[d][7:v]overlay=0:0:enable='gt(t,${2 * third})',fade=t=in:st=0:d=0.4,fade=t=out:st=${out - 0.4}:d=0.4[v]`,
  ].join(';'),
  '-map', '[v]', '-t', String(out), ...enc, `${frames}/sweep.mp4`,
]);

still('export', 4);
still('outro', 4.5);
writeFileSync(`${frames}/list.txt`, ['intro', 'step', 'sweep', 'export', 'outro'].map((n) => `file '${frames}/${n}.mp4'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', `${frames}/list.txt`, '-c', 'copy', '-movflags', '+faststart', `${build}/promo.mp4`]);
console.log(`promo: ${build}/promo.mp4 (${(3.5 + 3 + out + 4 + 4.5).toFixed(1)}s)`);
