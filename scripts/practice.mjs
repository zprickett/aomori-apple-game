// node scripts/practice.mjs <recipeId> <appleTestId> <outPrefix> [completedOrders]
import { chromium } from '@playwright/test';
const [,, recipe, appleId, out, done='15'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs=[]; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:5173/');
await page.evaluate((d) => localStorage.setItem('aomori-kitchen-save', JSON.stringify({ version: 2, completedOrders: +d })), done);
await page.reload();
await page.waitForSelector('[data-testid=open-practice]');
await page.click('[data-testid=open-practice]');
await page.click(`[data-testid=practice-${recipe}]`);
await page.click(`[data-testid=${appleId}]`);
await page.click('[data-testid=confirm-apple]');
let i = 0;
for (let k = 0; k < 60; k++) {
  const sub = await page.evaluate(() => document.querySelector('.frame').dataset.sub);
  const ph = await page.evaluate(() => document.querySelector('.frame').dataset.phase);
  if (ph !== 'cook') break;
  if (sub === 'instruction') {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}_${++i}_ready.png` });
    await page.click('[data-testid=ready]');
    await page.waitForTimeout(300);
  } else if (sub === 'active') {
    // use the alternate controls path via keyboard (Space) at the cue
    await page.evaluate(async () => { const c = window.__stepClock; while (performance.now() - c.startPerf < c.targetMs - 400) await new Promise(r => setTimeout(r, 5)); });
    for (let n = 0; n < 4; n++) { await page.keyboard.press('Space'); await page.waitForTimeout(60); }
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}_${i}_done.png` });
  } else await page.waitForTimeout(200);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}_result.png` });
console.log('errors', errs);
await browser.close();
