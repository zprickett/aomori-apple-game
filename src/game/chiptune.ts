/**
 * A tiny 8-bit music player for the opening intro, in the style of 80s Japanese home-console games:
 * a 25% pulse-wave lead, a square harmony, a triangle bass and noise drums. The tunes are original,
 * written on the yo scale (D E G A B), which gives them a bright Japanese folk feel.
 *
 * A song is one string per voice, one token per eighth note: a note name ("D5", "F#4"), "-" to hold
 * the previous note, "." for a rest. Drums: "k" kick, "s" snare, "h" hat, "." rest.
 */
import { audioContext } from './audio.ts';

/** 156.5 bpm: 24 beats land exactly on the logo at 9.2 s (src/three/IntroScene.tsx INTRO_T.logo). */
export const INTRO_BEAT = 9.2 / 24;

interface Song { lead?: string; harm?: string; bass?: string; drums?: string }

// Bars 1-2: the plane flies in. 3-4: Ojiichan waves. 5: the letter falls. 6: build. 7: the logo fanfare.
const THEME: Song = {
  lead:
    'D5 - A4 D5 E5 - D5 - | G5 - E5 D5 B4 - A4 - | D5 E5 G5 A5 B5 A5 G5 E5 | A5 - G5 E5 D5 - - - | ' +
    'B5 A5 G5 E5 D5 B4 A4 G4 | A4 B4 D5 E5 G5 A5 B5 D6 | D6 - - - A5 D6 E6 - | F#6 - - - - - - -',
  harm:
    '. . . . . . . . | . . . . . . . . | B4 - D5 - G5 - E5 - | E5 - D5 - A4 - - - | ' +
    'G5 - E5 - B4 - G4 - | F#4 - A4 - D5 - F#5 - | A5 - - - F#5 A5 B5 - | D6 - - - - - - -',
  bass:
    'D3 - A2 - D3 - A2 - | G2 - D3 - G2 - D3 - | D3 - A2 - D3 - A2 - | A2 - E3 - A2 - E3 - | ' +
    'G2 - D3 - E2 - B2 - | A2 A2 A2 A2 A2 A2 A3 A2 | D3 - - - A2 - D3 - | D2 - - - - - - -',
  drums:
    'k . h . s . h . | k . h k s . h . | k . h . s . h . | k . h k s . h h | ' +
    'k . h . s . h . | k . k . s s s s | k . . . s . k . | k . . . . . . .',
};

// While the letter waits on the counter: a light two-bar loop.
const WAIT: Song = {
  lead: 'D5 - . A4 B4 - D5 - | E5 - D5 - B4 - A4 - | D5 - . A4 B4 - D5 E5 | G5 - E5 - D5 - - -',
  bass: 'D3 - A2 - G2 - A2 - | D3 - A2 - G2 - A2 - | D3 - A2 - G2 - A2 - | E2 - A2 - D3 - - -',
  drums: 'k . h . . . h . | k . h . . . h . | k . h . . . h . | k . h . s . h h',
};

// The seal pops and the letter opens.
const OPEN: Song = {
  lead: 'D5 F#5 A5 D6 F#6 - - -',
  harm: 'A4 D5 F#5 A5 D6 - - -',
  bass: 'D3 - - - D2 - - -',
};

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freqOf(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Tokens → notes with start step and length in eighths (rests and holds folded in). */
function parse(line: string): { step: number; len: number; tok: string }[] {
  const toks = line.replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
  const out: { step: number; len: number; tok: string }[] = [];
  toks.forEach((tok, i) => {
    if (tok === '-') { if (out.length && out[out.length - 1].step + out[out.length - 1].len === i) out[out.length - 1].len++; return; }
    if (tok === '.') return;
    out.push({ step: i, len: 1, tok });
  });
  return out;
}
const steps = (line?: string) => (line ? line.replace(/\|/g, ' ').split(/\s+/).filter(Boolean).length : 0);

let pulse25: PeriodicWave | null = null;
let noiseBuf: AudioBuffer | null = null;
function pulseWave(c: AudioContext): PeriodicWave {
  if (pulse25) return pulse25;
  const n = 32, re = new Float32Array(n), im = new Float32Array(n), duty = 0.25;
  for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return (pulse25 = c.createPeriodicWave(re, im));
}
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.3);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export interface Playing { stop: () => void }

/** Schedule a song now on its own bus; `loop` repeats it until stopped. */
function play(song: Song, { beat = INTRO_BEAT, loop = false, gain = 0.5 }: { beat?: number; loop?: boolean; gain?: number } = {}): Playing {
  const c = audioContext();
  if (!c) return { stop() {} };
  const bus = c.createGain();
  bus.gain.value = gain;
  bus.connect(c.destination);
  const eighth = beat / 2;
  const len = Math.max(steps(song.lead), steps(song.bass), steps(song.drums), steps(song.harm));
  const sources: AudioScheduledSourceNode[] = [];

  const voice = (line: string | undefined, kind: 'lead' | 'harm' | 'bass', t0: number) => {
    if (!line) return;
    for (const n of parse(line)) {
      const f = freqOf(n.tok);
      if (!f) continue;
      const start = t0 + n.step * eighth, dur = n.len * eighth * 0.92;
      const o = c.createOscillator();
      if (kind === 'lead') o.setPeriodicWave(pulseWave(c));
      else o.type = kind === 'bass' ? 'triangle' : 'square';
      o.frequency.setValueAtTime(f, start);
      // A little vibrato on long lead notes, like the old sound chips.
      if (kind === 'lead' && n.len >= 3) {
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 6; lg.gain.value = f * 0.012;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(start + 0.15); lfo.stop(start + dur);
        sources.push(lfo);
      }
      const g = c.createGain();
      const vol = kind === 'lead' ? 0.16 : kind === 'harm' ? 0.05 : 0.22;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.008);
      g.gain.setValueAtTime(vol * (kind === 'bass' ? 1 : 0.8), start + Math.min(dur, 0.06));
      g.gain.linearRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(bus);
      o.start(start); o.stop(start + dur + 0.02);
      sources.push(o);
    }
  };
  const drums = (line: string | undefined, t0: number) => {
    if (!line) return;
    for (const n of parse(line)) {
      const start = t0 + n.step * eighth;
      const src = c.createBufferSource();
      src.buffer = noise(c);
      const f = c.createBiquadFilter();
      const g = c.createGain();
      const [type, freq, vol, dur] = n.tok === 'k' ? ['lowpass', 400, 0.5, 0.12] as const
        : n.tok === 's' ? ['bandpass', 1800, 0.28, 0.12] as const : ['highpass', 7000, 0.12, 0.04] as const;
      f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(f).connect(g).connect(bus);
      src.start(start); src.stop(start + dur + 0.02);
      sources.push(src);
      if (n.tok === 'k') {
        // The kick's pitch drop, from the triangle channel.
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(160, start); o.frequency.exponentialRampToValueAtTime(45, start + 0.1);
        og.gain.setValueAtTime(0.35, start); og.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        o.connect(og).connect(bus); o.start(start); o.stop(start + 0.14);
        sources.push(o);
      }
    }
  };
  const schedule = (t0: number) => {
    voice(song.lead, 'lead', t0); voice(song.harm, 'harm', t0); voice(song.bass, 'bass', t0); drums(song.drums, t0);
  };

  let timer = 0, next = c.currentTime + 0.05;
  schedule(next);
  if (loop) {
    const period = len * eighth;
    next += period;
    // Schedule each repeat a little before it is due.
    timer = window.setInterval(() => {
      if (c.currentTime > next - 0.5) { schedule(next); next += period; }
    }, 200);
  }
  return {
    stop() {
      window.clearInterval(timer);
      const now = c.currentTime;
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      for (const s of sources) { try { s.stop(now + 0.16); } catch { /* already stopped */ } }
      window.setTimeout(() => bus.disconnect(), 300);
    },
  };
}

/** The intro theme, started on the "Let's Go!" tap (bar 7 is the logo fanfare). */
export const playIntroTheme = () => play(THEME);
/** The quiet loop while the letter waits to be opened. */
export const playWaitLoop = () => play(WAIT, { loop: true, gain: 0.32 });
/** The seal pops and the letter opens. */
export const playOpenJingle = () => play(OPEN, { beat: 0.22, gain: 0.5 });
