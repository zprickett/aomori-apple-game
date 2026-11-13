import { chromium } from '@playwright/test';
const [,, recipe, appleId, out] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errs=[]; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:5173/');
await page.evaluate(() => localStorage.setItem('aomori-kitchen-save', JSON.stringify({ version: 2, completedOrders: 15 })));
await page.reload();
await page.waitForSelector('[data-testid=open-practice]');
await page.click('[data-testid=open-practice]');
await page.click(`[data-testid=practice-${recipe}]`);
await page.click(`[data-testid=${appleId}]`);
await page.click('[data-testid=confirm-apple]');
let n = 0;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const st = await page.evaluate(() => ({ s: document.querySelector('.frame').dataset.sub, p: document.querySelector('.frame').dataset.phase }));
  if (st.p !== 'cook') break;
  if (st.s === 'instruction') { await page.screenshot({ path: `${out}_${++n}_verb.png` }); await page.waitForFunction(() => document.querySelector('.frame').dataset.sub !== 'instruction'); }
  else if (st.s === 'active') {
    // screenshot while the first ring is closing, then slice on cue
    const { playBeats } = await import('../e2e/arcade-lib.mjs');
    await playBeats(page);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}_${++n}_hit.png` });
    await page.waitForFunction(() => document.querySelector('.frame').dataset.sub !== 'active');
  } else await page.waitForTimeout(60);
}
console.log('errors', errs, 'shots', n, 'secs', (Date.now() - t0) / 1000);
await browser.close();
