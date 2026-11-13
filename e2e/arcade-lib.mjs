// Shared helper: perform the current active step's beats in-page with synthetic pointer events.
// opts.offsets: per-beat timing offsets in ms (0 = on the cue); null entry = skip that beat.
export async function playBeats(page, opts = {}) {
  return page.evaluate(async ({ offsets }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const layer = document.querySelector('[data-testid=gesture-layer]');
    const box = document.querySelector('.frame').getBoundingClientRect();
    const ring = document.querySelector('[data-testid=target-ring]');
    const cx = +ring.getAttribute('cx'), cy = +ring.getAttribute('cy'), R = +ring.getAttribute('r');
    const n = window.__beats.targets.length, gesture = window.__beats.gesture, start = window.__beats.start;
    const fire = (type, x, y) => layer.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: box.left + x, clientY: box.top + y, pointerId: 5, pointerType: 'touch', isPrimary: true }));
    const now = () => performance.now() - start;
    for (let i = 0; i < n; i++) {
      while ((window.__beats.i ?? 0) < i) await sleep(2); // wait until the previous beat resolved
      await sleep(1);
      const off = offsets && i < offsets.length ? offsets[i] : 0;
      if (off === null) continue;
      const at = window.__beats.targets[i] + off;
      if (gesture === 'tap') {
        while (now() < at) await sleep(2);
        fire('pointerdown', cx, cy); fire('pointerup', cx, cy);
      } else if (gesture === 'swipe') {
        // 60 ms flick from left to right through the centre, crossing it at `at`
        const dir = i % 2 ? -1 : 1, span = R * 2.4, dur = 60;
        while (now() < at - dur / 2) await sleep(2);
        const t0 = now();
        fire('pointerdown', cx - dir * span, cy - 10);
        for (;;) {
          await sleep(8);
          const k = Math.min(1, (now() - t0) / dur);
          fire('pointermove', cx - dir * span + dir * 2 * span * k, cy - 10 + 20 * k);
          if (k >= 1) break;
        }
        fire('pointerup', cx + dir * span, cy + 10);
      } else {
        const lead = 2200, r = R;
        while (now() < at - lead) await sleep(2);
        const t0 = now();
        fire('pointerdown', cx + r, cy);
        for (;;) {
          await sleep(16);
          const k = Math.min(1.06, (now() - t0) / lead);
          const a = k * Math.PI * 4;
          fire('pointermove', cx + r * Math.cos(a), cy + r * Math.sin(a));
          if (k >= 1.06 || document.querySelector('.frame').dataset.sub !== 'active') break;
        }
        fire('pointerup', cx + r, cy);
      }
    }
  }, { offsets: opts.offsets ?? null });
}
export const sub = (p) => p.evaluate(() => document.querySelector('.frame').dataset.sub);
export const phase = (p) => p.evaluate(() => document.querySelector('.frame').dataset.phase);
