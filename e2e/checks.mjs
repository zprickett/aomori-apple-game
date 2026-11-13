// Browser integration checks (real DOM pointer events + reducer + persistence) for the arcade cooking flow.
// Run against the dev server (uses DEV-only window.__beats): node e2e/checks.mjs [URL]
import { chromium } from '@playwright/test';
import { playBeats } from './arcade-lib.mjs';

const URL = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

async function newPage({ w = 390, h = 844, save = null, init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL);
  if (save !== null) {
    await page.evaluate((s) => { localStorage.clear(); if (s) localStorage.setItem('aomori-kitchen-save', JSON.stringify(s)); }, save);
    await page.reload();
  }
  await page.waitForSelector('.frame[data-phase]', { timeout: 30000 });
  return page;
}
const sub = (p) => p.evaluate(() => document.querySelector('.frame').dataset.sub);
const saved = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('aomori-kitchen-save') || 'null'));
const until = (p, fn, arg, t = 15000) => p.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const waitSub = (p, s) => until(p, (s) => document.querySelector('.frame').dataset.sub === s, s);
const waitPhase = (p, s) => until(p, (s) => document.querySelector('.frame').dataset.phase === s, s);

async function startOrder(p, appleId = 'a048') {
  await p.click('[data-testid=accept]');
  await p.click(`[data-testid=apple-${appleId}]`);
  await p.click('[data-testid=confirm-apple]');
  await waitSub(p, 'active');
}
/** Fire a raw gesture at frame coordinates at time `at` (ms on the step clock). */
async function gesture(p, { at = 0, points, cancel = false, dt = 14 }) {
  return p.evaluate(async ({ at, points, cancel, dt }) => {
    const layer = document.querySelector('[data-testid=gesture-layer]');
    const box = document.querySelector('.frame').getBoundingClientRect();
    const B = window.__beats;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    while (performance.now() - B.start < at) await sleep(2);
    const fire = (type, [x, y]) => layer.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: box.left + x, clientY: box.top + y, pointerId: 3, pointerType: 'touch', isPrimary: true }));
    fire('pointerdown', points[0]);
    for (let i = 1; i < points.length; i++) { await sleep(dt); fire('pointermove', points[i]); }
    fire(cancel ? 'pointercancel' : 'pointerup', points[points.length - 1]);
  }, { at, points, cancel, dt });
}
const ringGeo = (p) => p.evaluate(() => { const r = document.querySelector('[data-testid=target-ring]'); return { x: +r.getAttribute('cx'), y: +r.getAttribute('cy'), r: +r.getAttribute('r') }; });
const beats = (p) => p.evaluate(() => window.__beats);
const pips = (p) => p.$$eval('.beat-pips .pip', (ps) => ps.map((x) => x.className.replace('pip', '').trim()));

// ---------------------------------------------------------------- layouts
for (const [w, h] of [[360, 800], [390, 844], [430, 932], [1280, 800]]) {
  const p = await newPage({ w, h, save: {} });
  await p.waitForSelector('[data-testid=accept]');
  const m = await p.evaluate(() => {
    const r = document.querySelector('[data-testid=accept]').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, bottom: r.bottom, ih: innerHeight };
  });
  await startOrder(p);
  const g = await ringGeo(p);
  const panel = await p.evaluate(() => document.querySelector('[data-testid=cook-panel]').getBoundingClientRect().top);
  check(`layout ${w}x${h}: no horizontal scroll, CTA visible, target above HUD and ≥48px`, m.sw <= m.iw && m.bottom <= m.ih && g.y + g.r < panel && g.r * 2 >= 48, JSON.stringify({ ...m, ring: g, panel }));
  await p.context().close();
}

// ---------------------------------------------------------------- flow speed: no Ready button, quick start
{
  const p = await newPage({ save: {} });
  await p.click('[data-testid=accept]');
  await p.click('[data-testid=apple-a048]');
  const t0 = Date.now();
  await p.click('[data-testid=confirm-apple]');
  await waitSub(p, 'active');
  const ms = Date.now() - t0;
  check('cooking starts without a Ready button, within ~4 s of choosing (juice: chef prep + prompt)', !(await p.$('[data-testid=ready]')) && ms < 6000, `${ms} ms`);
  // tap outside highlighted object is ignored
  const B = await beats(p);
  await gesture(p, { at: B.targets[0] - 200, points: [[20, 300]] });
  await p.waitForTimeout(60);
  check('tap outside the target is ignored (beat still open)', (await sub(p)) === 'active');
  // spam taps on the cue → exactly one beat result
  await p.evaluate(async () => {
    const B = window.__beats;
    const layer = document.querySelector('[data-testid=gesture-layer]');
    const box = document.querySelector('.frame').getBoundingClientRect();
    const r = document.querySelector('[data-testid=target-ring]');
    const x = box.left + +r.getAttribute('cx'), y = box.top + +r.getAttribute('cy');
    while (performance.now() - B.start < B.targets[0] - 20) await new Promise((res) => setTimeout(res, 2));
    for (let i = 0; i < 10; i++) {
      layer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 20 + i, pointerType: 'touch' }));
      layer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 20 + i, pointerType: 'touch' }));
    }
  });
  await waitPhase(p, 'result');
  const s = await saved(p);
  check('rapid tap spam submits once (one result, order counted once)', s.completedOrders === 1 && s.current?.pendingResult?.grades?.length === 1, JSON.stringify(s.current?.pendingResult?.grades));
  check('tap on the closing ring grades Perfect/Good', /Perfect|Good/.test(s.current.pendingResult.grades[0].grade), s.current.pendingResult.grades[0].grade);
  await p.reload();
  await p.waitForSelector('[data-testid=result-card]');
  check('reload on result screen keeps the result without double counting', (await saved(p)).completedOrders === 1);
  check('no page errors (tap flow)', p.errors.length === 0, p.errors.join('|'));
  await p.context().close();
}

// ---------------------------------------------------------------- tight windows, early/late, deadline, help
{
  const p = await newPage({ save: { version: 2, completedOrders: 3 } }); // order 4: normal (non-learning) windows
  await startOrder(p);
  let B = await beats(p);
  const g = await ringGeo(p);
  await gesture(p, { at: 5, points: [[g.x, g.y]] });
  await p.waitForTimeout(60);
  const hint = await p.textContent('.soft-hint');
  check('tapping before the ring appears is ignored with a hint', (await sub(p)) === 'active' && /ring/i.test(hint), hint);
  await gesture(p, { at: B.targets[0] - 330, points: [[g.x, g.y]] }); // ring visible but 330 ms early (> OK 260)
  await waitSub(p, 'miss');
  const bubble = await p.textContent('[data-testid=chef-bubble]');
  check('an early tap outside the tight window is a Miss ("early")', /early/i.test(bubble), bubble);
  await p.click('[data-testid=retry]');
  await waitSub(p, 'active');
  B = await beats(p);
  await gesture(p, { at: B.targets[0] + 200, points: [[g.x, g.y]] }); // 200 ms late → OK
  await until(p, () => ['feedback', 'miss'].includes(document.querySelector('.frame').dataset.sub) || document.querySelector('.frame').dataset.phase !== 'cook');
  const late = (await saved(p)).current?.pendingResult?.grades?.[0]?.grade ?? (await p.textContent('.grade-pop').catch(() => ''));
  check('a 200 ms late tap only earns OK (tight timing)', /OK/.test(late), late);
  await p.context().close();
}
{
  const p = await newPage({ save: { version: 2, completedOrders: 3 } });
  await startOrder(p);
  const t0 = Date.now();
  await waitSub(p, 'miss');
  check('no input → beat expires quickly and grades Miss', Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  await p.click('[data-testid=continue-help]');
  await waitPhase(p, 'result');
  const chips = await p.$$eval('.res-grades .chip', (cs) => cs.map((c) => c.textContent));
  check('“Chef, help!” records the Miss and finishes the dish (no apples lost)', chips.join().includes('Miss'), chips.join());
  await p.context().close();
}

// ---------------------------------------------------------------- slicing
{
  const p = await newPage({ save: { version: 2, completedOrders: 3 } }); // order 4 is juice; use practice rabbit
  await p.click('[data-testid=open-practice]');
  await p.click('[data-testid=practice-rabbit_apples]');
  await p.click('[data-testid=apple-a048]');
  await p.click('[data-testid=confirm-apple]');
  await waitSub(p, 'active');
  let B = await beats(p);
  check('whole-apple cut is three slice beats', B.targets.length === 3 && B.gesture === 'swipe', JSON.stringify(B.targets));
  const g = await ringGeo(p);
  // slow drag through the fruit does not cut
  await gesture(p, { at: B.targets[0] - 600, points: Array.from({ length: 12 }, (_, i) => [g.x - 60 + i * 11, g.y]), dt: 60 });
  check('a slow drag through the apple does not cut', (await pips(p)).every((c) => c === ''));
  // a cancelled stroke does not cut
  await gesture(p, { at: B.targets[0] - 200, points: [[g.x - 120, g.y], [g.x - 70, g.y]], cancel: true });
  check('pointercancel discards the stroke', (await pips(p)).every((c) => c === ''));
  // slice beats 1 and 3 on cue, skip beat 2 → step is Good (not Perfect)
  await playBeats(p, { offsets: [0, null, 0] });
  await until(p, () => ['feedback', 'miss'].includes(document.querySelector('.frame').dataset.sub));
  const pp = await pips(p);
  const pop = await p.textContent('.grade-pop').catch(() => '');
  check('Fruit-Ninja slices score per beat; a skipped slice caps the step below Perfect', pp[1] === 'p-Miss' && /Perfect|Good/.test(pp[0]) && /Good|OK/.test(pop), `${pp.join(',')} → ${pop}`);
  // next step (ears): diagonal reverse strokes on cue → Perfect
  await waitSub(p, 'active');
  B = await beats(p);
  check('rabbit-ear cut is two slice beats', B.targets.length === 2);
  // hidden page mid-step → restarts with a fresh prompt, step 1 kept
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(80);
  const hiddenSub = await sub(p);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await waitSub(p, 'active');
  const dots = await p.$$eval('.step-dots .dot', (d) => d.map((x) => x.className));
  check('hidden page pauses the step and restarts it fresh; earlier step kept', hiddenSub === 'instruction' && dots[0].includes('done'), hiddenSub);
  await playBeats(p);
  await waitPhase(p, 'result');
  check('practice rabbit completes (no progress change)', (await saved(p)).completedOrders === 3);
  check('no page errors (slice flow)', p.errors.length === 0, p.errors.join('|'));
  await p.context().close();
}

// ---------------------------------------------------------------- reload mid-recipe
{
  const p = await newPage({ save: { version: 2, completedOrders: 2 } }); // order 3 = rabbit wedges
  await startOrder(p);
  await playBeats(p);
  await until(p, () => document.querySelector('.frame').dataset.sub === 'bridge' || document.querySelector('.frame').dataset.sub === 'instruction' || (document.querySelector('.step-dots .dot')?.className.includes('done')));
  await waitSub(p, 'active');
  await p.reload();
  await waitSub(p, 'active');
  const dots = await p.$$eval('.step-dots .dot', (d) => d.map((x) => x.className));
  check('reload mid-recipe resumes the unfinished step with the finished one kept', dots[0].includes('done') && dots[1].includes('now'), dots.join(','));
  await p.context().close();
}

// ---------------------------------------------------------------- stirring
{
  const p = await newPage({ save: { version: 2, completedOrders: 15 } });
  await p.click('[data-testid=open-practice]');
  await p.click('[data-testid=practice-apple_jam]');
  await p.click('[data-testid=apple-a094]');
  await p.click('[data-testid=confirm-apple]');
  for (let i = 0; i < 2; i++) { await waitSub(p, 'active'); await playBeats(p); await until(p, () => document.querySelector('.frame').dataset.sub !== 'active'); }
  await waitSub(p, 'active');
  const g = await ringGeo(p);
  const ring = (a) => [g.x + g.r * Math.cos(a), g.y + g.r * Math.sin(a)];
  const wiggle = []; for (let i = 0; i < 40; i++) wiggle.push(ring(((i % 8) < 4 ? i % 4 : 4 - (i % 4)) * 0.4));
  await gesture(p, { at: 50, points: wiggle, dt: 18 });
  check('back-and-forth wiggling cannot farm stirring progress', (await sub(p)) === 'active');
  await playBeats(p);
  await until(p, () => document.querySelector('.frame').dataset.sub !== 'active');
  const pop = await p.textContent('.grade-pop').catch(() => 'miss');
  check('two clean stirring circles finishing on the ring complete the mix', /Perfect|Good|OK/.test(pop), pop);
  await p.context().close();
}

// ---------------------------------------------------------------- settings: alt controls, reduced motion
{
  const p = await newPage({ save: {} });
  await p.click('[data-testid=open-settings]');
  await p.check('[data-testid=set-alt]');
  await p.click('.seg button:nth-of-type(2)');
  await p.click('[data-testid=close-sheet]');
  const reduced = await p.evaluate(() => document.querySelector('.frame').classList.contains('reduced'));
  await startOrder(p);
  await p.evaluate(async () => { const B = window.__beats; while (performance.now() - B.start < B.targets[0]) await new Promise((r) => setTimeout(r, 2)); document.querySelector('[data-testid=alt-action]').click(); });
  await waitPhase(p, 'result');
  check('reduced-motion setting applies', reduced);
  check('big-button control completes a timed step', (await saved(p)).current.pendingResult.grades.length === 1);
  await p.context().close();
}

// ---------------------------------------------------------------- saves
{
  const p = await newPage({ save: { version: 1, completedOrders: 4, unlockedApples: ['a048', 'a094'], bestScores: { fresh_juice: 2 }, current: { orderId: 'o-0005', recipeId: 'apple_jam', appleId: 'a094', minigameStep: 2 } } });
  const notice = await p.textContent('[data-testid=notice]').catch(() => '');
  const s = await saved(p);
  check('legacy v1 save migrates (progress kept, dish restarts, notice)', /Cooking controls updated/.test(notice) && s.completedOrders === 4 && s.bestScores.fresh_juice === 2 && (s.current?.stepIndex ?? 0) === 0, notice);
  await p.context().close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.evaluate(() => localStorage.setItem('aomori-kitchen-save', '{not json'));
  await p.reload();
  await p.waitForSelector('[data-testid=accept]');
  check('invalid save JSON starts safely with a notice', !!(await p.$('[data-testid=notice]')));
  await ctx.close();
}
{
  const p = await newPage({ init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); } });
  await p.waitForSelector('[data-testid=accept]');
  const warn = await p.textContent('.save-warn').catch(() => '');
  check('storage unavailable → in-memory play with visible notice', /cannot be saved/i.test(warn), warn);
  await p.context().close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
