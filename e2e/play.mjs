// End-to-end playthrough with real pointer gestures (mouse or touch-like mouse events).
// Usage: node e2e/play.mjs --orders 3 --w 390 --h 844 --shots DIR [--miss] [--url URL]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { playBeats } from './arcade-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const ORDERS = +(args.orders ?? 2);
const W = +(args.w ?? 390), H = +(args.h ?? 844);
const SHOTS = args.shots;
const URL = args.url ?? 'http://127.0.0.1:5173/';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: +(args.dpr ?? 1) });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && !m.text().includes('fonts.g')) errors.push(m.text()); });
await page.goto(URL);
if (args.fresh) { await page.evaluate(() => localStorage.clear()); await page.reload(); }
await page.waitForSelector('[data-testid=accept], [data-testid=apple-drawer], [data-testid=gesture-layer], [data-testid=result-card], [data-testid=delivery-card]', { timeout: 30000 });
let shotN = 0;
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++shotN).padStart(2, '0')}_${name}.png` }); };

const phase = () => page.evaluate(() => ({ phase: document.querySelector('.frame')?.dataset.phase, sub: document.querySelector('.frame')?.dataset.sub }));

/** Wait until the timing marker reaches `frac` of the track. Returns ms elapsed estimate. */
async function waitMarker(frac) {
  await page.waitForFunction((f) => {
    const m = document.querySelector('.marker');
    return m && parseFloat(m.style.left) / 100 >= f;
  }, frac, { polling: 'raf', timeout: 12000 });
}

async function doStep(miss) {
  await page.waitForFunction(() => document.querySelector('.frame')?.dataset.sub === 'active', null, { timeout: 15000 });
  const g = await page.evaluate(() => window.__beats.gesture);
  await playBeats(page, miss ? { offsets: [null, null, null] } : {});
  return g;
}

const log = [];
for (let o = 0; o < ORDERS; o++) {
  await page.waitForSelector('[data-testid=accept]', { timeout: 20000 });
  await page.waitForTimeout(1600);
  await shot('shop');
  const order = await page.textContent('[data-testid=order-bubble] .order-name');
  await page.click('[data-testid=accept]');
  await page.waitForSelector('[data-testid=apple-drawer]');
  // pick the first unlocked apple with the most stars
  const appleId = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.apple-card:not(.locked)')];
    let best = cards[0], bs = -1;
    for (const c of cards) { const s = c.querySelectorAll('.stars path[fill="#F4B93A"]').length; if (s > bs) { bs = s; best = c; } }
    return best.dataset.testid;
  });
  await page.click(`[data-testid=${appleId}]`);
  await shot('choose');
  await page.click('[data-testid=confirm-apple]');
  const gestures = [];
  let missDone = false;
  for (;;) {
    const p = await phase();
    if (p.phase !== 'cook') break;
    if (p.sub === 'miss') {
      await shot('miss');
      await page.click('[data-testid=retry]');
      continue;
    }
    if (p.sub === 'bridge' || p.sub === 'feedback' || p.sub === 'countin') { await page.waitForTimeout(60); continue; }
    if (p.sub === 'instruction') {
      await shot('instruction');
      const doMiss = !!args.miss && !missDone; missDone = true;
      gestures.push(await doStep(doMiss));
      await page.waitForTimeout(250);
      await shot('after');
      continue;
    }
    await page.waitForTimeout(100);
  }
  await page.waitForSelector('[data-testid=result-card]', { timeout: 20000 });
  await page.waitForTimeout(900);
  await shot('result');
  const res = await page.evaluate(() => ({
    explain: document.querySelector('[data-testid=explanation]')?.textContent,
    grades: [...document.querySelectorAll('.res-grades .chip')].map((c) => c.textContent),
  }));
  log.push({ order, appleId, gestures, ...res });
  console.log(JSON.stringify(log[log.length - 1]));
  await page.click('[data-testid=result-next]');
  await page.waitForTimeout(500);
  if (await page.$('[data-testid=delivery-card]')) {
    await page.waitForTimeout(900);
    await shot('delivery');
    await page.click('[data-testid=delivery-done]');
  }
}
const save = await page.evaluate(() => localStorage.getItem('aomori-kitchen-save'));
console.log('save:', save?.slice(0, 300));
console.log('errors:', JSON.stringify(errors));
await browser.close();
