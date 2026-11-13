/** Short procedural sound effects (WebAudio). Starts only after a user gesture; respects mute. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) { enabled = on; }

export function unlockAudio() {
  if (!enabled) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

export function suspendAudio() { try { void ctx?.suspend(); } catch { /* ignore */ } }

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0, slide = 0) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.12, hp = 1200, delay = 0) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  tap: () => tone(660, 0.09, 'triangle', 0.12),
  pop: () => { tone(520, 0.08, 'sine', 0.14); tone(880, 0.08, 'sine', 0.08, 0.05); },
  chop: () => { noise(0.07, 0.18, 2500); tone(180, 0.06, 'square', 0.04); },
  swish: () => noise(0.16, 0.1, 3000),
  stir: () => tone(300 + Math.random() * 60, 0.05, 'sine', 0.035),
  tick: () => tone(1200, 0.03, 'square', 0.03),
  perfect: () => { [784, 988, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.07)); },
  good: () => { [659, 880].forEach((f, i) => tone(f, 0.16, 'triangle', 0.11, i * 0.07)); },
  ok: () => tone(587, 0.18, 'triangle', 0.1),
  miss: () => tone(330, 0.25, 'sine', 0.1, 0, -120),
  bell: () => { tone(1568, 0.5, 'sine', 0.08); tone(2093, 0.4, 'sine', 0.05, 0.03); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.1)); },
  whirr: () => { tone(110, 0.6, 'sawtooth', 0.04, 0, 80); },
  sizzle: () => noise(0.5, 0.05, 4000),
  star: (i: number) => tone(880 + i * 220, 0.16, 'triangle', 0.12),
};
