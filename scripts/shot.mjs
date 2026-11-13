// Usage: node scripts/shot.mjs out.png [w h] [actions-json]
import { chromium } from '@playwright/test';
const [,, out='shot.png', w='390', h='844', actions='[]'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: true });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await page.goto(process.env.URL || 'http://127.0.0.1:5173/');
await page.waitForTimeout(+(process.env.WAIT||4000));
for (const a of JSON.parse(actions)) {
  if (a.click) await page.click(a.click);
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.eval) await page.evaluate(a.eval);
  if (a.shot) await page.screenshot({ path: a.shot });
}
await page.screenshot({ path: out });
console.log('errors:', JSON.stringify(errs.slice(0,10)));
await browser.close();
