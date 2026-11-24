/**
 * The opening intro (first visit, or "Watch intro" in Settings).
 * 1. A pulsing "Let's Go!" apple: the tap that lets the phone play sound.
 * 2. Ojiichan flies over Aomori in his plane, waves, and drops his letter (src/three/IntroScene.tsx).
 * 3. The letter flutters down onto the empty stall, the logo lands, and the kid taps the letter.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { INTRO, letterFor } from '../core/index.ts';
import { IntroScene, type IntroPhase } from '../three/IntroScene.tsx';
import { BACKGROUNDS, backdropFit } from '../game/backgrounds.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { INTRO_BEAT, playIntroTheme, playOpenJingle, playWaitLoop, type Playing } from '../game/chiptune.ts';
import { Logo } from './Logo.tsx';
import { LetterSign } from './Notebook.tsx';

/** Reduce Motion only calms decoration here (pulses, the logo slam); the story itself always plays. */
function prefersReduced(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** The faceted clouds of the sky above the painting (same flat low-poly style as its own clouds). */
function SkyClouds() {
  const cloud = (x: number, y: number, s: number, k: number) => (
    <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-110 0 L-86 -40 L-45 -50 L-10 -30 L20 -70 L70 -64 L96 -30 L120 -20 L130 0 Z" fill="#FFFFFF" />
      <path d="M20 -70 L70 -64 L96 -30 L120 -20 L130 0 L40 0 Z" fill="#E4EEF8" />
      <path d="M-110 0 L130 0 L118 10 L-100 10 Z" fill="#D3E2F2" />
    </g>
  );
  return (
    <svg className="intro-clouds" viewBox="0 0 400 1000" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {[[70, 190, 0.7], [320, 330, 0.55], [140, 560, 0.85], [330, 760, 0.6], [60, 900, 0.5]].map(([x, y, s], i) => cloud(x, y, s, i))}
    </svg>
  );
}

function LetsGo({ onGo }: { onGo: () => void }) {
  return (
    <button type="button" className="intro-go" data-testid="intro-go" onClick={onGo} aria-label={`${INTRO.letsGo} ${INTRO.letsGoJa}`}>
      <span className="intro-go-apple" aria-hidden>
        <span className="intro-go-ring" />
        <span className="intro-go-ring r2" />
        <svg viewBox="-120 -135 240 250">
          <path d="M0 -70 C-40 -100 -110 -90 -112 -10 C-114 60 -60 112 -20 104 C-8 101 8 101 20 104 C60 112 114 60 112 -10 C110 -90 40 -100 0 -70 Z"
            fill="#D94232" stroke="#4A3326" strokeWidth="8" strokeLinejoin="round" />
          <path d="M0 -70 C40 -100 110 -90 112 -10 C114 60 60 112 20 104 L18 30 Z" fill="#9E2E22" opacity="0.4" />
          <ellipse cx="-62" cy="-48" rx="13" ry="24" transform="rotate(30 -62 -48)" fill="#FFFAF0" opacity="0.8" />
          <path d="M-4 -72 Q-2 -100 12 -122" fill="none" stroke="#68452E" strokeWidth="10" strokeLinecap="round" />
          <path d="M10 -108 Q40 -140 78 -122 Q50 -92 10 -108 Z" fill="#6A8C42" stroke="#4A3326" strokeWidth="4" strokeLinejoin="round" />
        </svg>
        <span className="intro-go-text">{INTRO.letsGo}</span>
      </span>
      <span className="intro-go-ja" lang="ja">{INTRO.letsGoJa}</span>
    </button>
  );
}

/** Ojiichan's letter, opened from the stall: the envelope flies up from the counter, the seal pops,
 *  the flap opens and the letter slides out over the Aomori stall scene. */
function OpenLetter({ from, doneLabel, onDone }: { from: { dx: number; dy: number }; doneLabel: string; onDone: () => void }) {
  const l = letterFor('');
  const vars = { ['--dx' as string]: `${from.dx}px`, ['--dy' as string]: `${from.dy}px` };
  return (
    <div className="io" data-testid="intro-open">
      <div className="io-veil" />
      <div className="io-back" style={vars}><div className="io-flap" /></div>
      <div className="io-paper lt-paper" data-testid="family-letter">
        <div className="lt-stamp" aria-hidden>🍎</div>
        <p className="lt-greet">{l.greeting}</p>
        {l.body.map((b) => <p key={b}>{b}</p>)}
        <LetterSign signoff={l.signoff} signature={l.signature} />
      </div>
      <div className="io-front" style={vars}><div className="io-pocket" /><div className="io-seal" aria-hidden /></div>
      <div className="onb-foot io-foot">
        <button className="btn primary huge" data-testid="letter-done" onClick={() => { unlockAudio(); sfx.tap(); onDone(); }}>{doneLabel}</button>
      </div>
    </div>
  );
}

export function Intro({ onDone, replay = false, doneLabel = 'Make your chef' }: { onDone: () => void; replay?: boolean; doneLabel?: string }) {
  const [reduced] = useState(prefersReduced);
  const [started, setStarted] = useState(replay);
  const [phase, setPhase] = useState<IntroPhase>('sky');
  const [opened, setOpened] = useState<{ dx: number; dy: number } | null>(null);
  const skipRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const music = useRef<{ theme: Playing | null; wait: Playing | null; timer: number }>({ theme: null, wait: null, timer: 0 });
  const city = BACKGROUNDS.aomori_city;
  const fit = backdropFit(city);
  const ready = phase === 'ready';

  const stopMusic = useCallback(() => {
    const m = music.current;
    window.clearTimeout(m.timer);
    m.theme?.stop(); m.wait?.stop();
    m.theme = null; m.wait = null;
  }, []);
  // The theme runs ~12 s (its bar 7 is the logo); then a quiet loop while the letter waits.
  const startMusic = useCallback((skipped: boolean) => {
    stopMusic();
    const m = music.current;
    if (!skipped) m.theme = playIntroTheme();
    m.timer = window.setTimeout(() => { m.wait = playWaitLoop(); }, skipped ? 300 : INTRO_BEAT * 32 * 1000);
  }, [stopMusic]);
  useEffect(() => {
    if (replay) startMusic(false);
    return stopMusic;
  }, [replay, startMusic, stopMusic]);

  const onCue = useCallback((cue: 'plane' | 'wave' | 'drop' | 'land' | 'logo') => {
    if (cue === 'drop') sfx.swish();
    if (cue === 'land') sfx.pop();
  }, []);

  const go = () => { unlockAudio(); setStarted(true); startMusic(false); };
  const skip = () => { skipRef.current = true; startMusic(true); };
  const open = () => {
    if (!ready || opened) return;
    unlockAudio();
    stopMusic();
    playOpenJingle();
    // Where the letter sits on screen, relative to the middle, so the envelope flies up from it.
    const r = rootRef.current?.getBoundingClientRect();
    const h = hintRef.current?.getBoundingClientRect();
    const dx = r && h ? h.left + h.width / 2 - (r.left + r.width / 2) : 0;
    const dy = r && h ? h.bottom + 40 - (r.top + r.height * 0.46) : 200;
    setOpened({ dx, dy });
  };

  return (
    <div ref={rootRef} className={`frame intro ${reduced ? 'reduced' : ''} ${opened ? 'opened' : ''}`} data-testid="intro" data-phase={started ? phase : 'go'}>
      <div className="intro-bg" ref={bgRef} aria-hidden>
        <div className="intro-sky" style={{ bottom: `${(1 - fit.top) * 100}%` }}><SkyClouds /></div>
        <div className="scene-bg" style={{ backgroundImage: `url(${city.url})`, top: `${fit.top * 100}%`, height: `${fit.height * 100}%` }} />
      </div>
      <div className="canvas-wrap" onClick={open}>
        <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          camera={{ fov: 34, near: 0.1, far: 100, position: [0, 3, 12] }}>
          <Suspense fallback={null}>
            <IntroScene started={started} reduced={reduced} opened={!!opened} skipRef={skipRef} bgRef={bgRef} bubbleRef={bubbleRef} hintRef={hintRef}
              onPhase={setPhase} onCue={onCue} />
          </Suspense>
        </Canvas>
      </div>

      <div className={`intro-bubble ${started && phase === 'bye' ? 'on' : ''}`} ref={bubbleRef} aria-live="polite">
        <b>{INTRO.byeSay}</b>
        <span>{INTRO.byeSay2}</span>
      </div>

      {(phase === 'logo' || ready) && !opened && <Logo slam={!reduced} className="intro-logo" />}

      <button type="button" ref={hintRef} className={`intro-hint ${ready && !opened ? 'on' : ''}`} data-testid="intro-letter" onClick={open} tabIndex={ready ? 0 : -1}>
        <span>✉️ {INTRO.tap}</span>
      </button>

      {started && !ready && (
        <button type="button" className="btn small intro-skip" data-testid="intro-skip" onClick={skip}>Skip ›</button>
      )}

      {opened && <OpenLetter from={opened} doneLabel={doneLabel} onDone={onDone} />}

      {!started && <LetsGo onGo={go} />}
    </div>
  );
}
