import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChefContext } from '../game/chef.ts';
import {
  CircleRecognizer, SliceRecognizer, TapRecognizer, PACE, ARCADE_WINDOWS, beatLead, nextBeatTarget,
  beatExpiresAt, beatOpensAt, beatTargets, combineBeats, gradeBeat, selectors, apple as appleInfo,
  type BeatResult, type GameAction, type GameState, type Gesture, type StepDef,
} from '../core/index.ts';
import type { StepStage } from '../game/stations.ts';
import { emitCue, mixing, pointer, stepClock, useAnchors, type Anchor } from '../game/bus.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { GestureIcon } from './icons.tsx';

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
  stage: StepStage;
  stages: StepStage[];
  bridgeFrame: number;
  setBridgeFrame: (n: number) => void;
  reduced: boolean;
}

const VERB: Record<Gesture, string> = { swipe: 'SLICE!', tap: 'TAP!', circle: 'STIR!' };
const HOWTO: Record<Gesture, string> = {
  swipe: 'Slash through the apple when the ring closes!',
  tap: 'Tap when the ring closes!',
  circle: 'Stir round and round — finish as the ring closes!',
};
const GRADE_LINE: Record<string, string[]> = {
  Perfect: ['Perfect!', 'Spot on!', 'Amazing!'],
  Good: ['Great job!', 'Nicely done!'],
  OK: ['Good try!', 'That works!'],
};
const POP_WORD: Record<string, string> = { Perfect: 'Perfect!', Good: 'Good!', OK: 'OK', Miss: 'Miss' };

/** Gestures already introduced in this browser session (longer first prompt + hint hand). */
const seenGestures = new Set<string>();

interface Geo { W: number; left: number; top: number; target: Anchor }
function useGeometry(): Geo | null {
  const { anchors, w } = useAnchors();
  const work = anchors.work, target = anchors.target;
  if (!work || !target || !w) return null;
  return { W: w, left: work.x - w / 2, top: work.y - w / 2, target };
}

interface Fx { id: number; kind: 'slash' | 'splash' | 'pop' | 'tapburst'; x: number; y: number; angle?: number; word?: string; grade?: string; color?: string }

export function CookOverlay({ state, dispatch, stage, stages, bridgeFrame, setBridgeFrame, reduced }: Props) {
  const cook = state.cook!;
  const step = selectors.currentStep(state)!;
  const recipe = selectors.activeRecipe(state);
  const geo = useGeometry();
  const sub = cook.sub;
  const alt = state.settings.altControls;
  const g = step.gesture;
  // Wider windows while learning (first 3 orders) or in Helper mode; practice is never assisted.
  const mult = state.settings.assistance || (state.mode === 'order' && state.order.orderNumber <= 3) ? 1.5 : 1;
  const juice = state.appleId ? appleInfo(state.appleId).flesh : '#FFF1C9';
  const skin = state.appleId ? appleInfo(state.appleId).skin.base : '#D94232';

  const ringRef = useRef<SVGCircleElement>(null);
  const progressRef = useRef<SVGCircleElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<SVGPolylineElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const startPerf = useRef(0);
  const submitted = useRef(false);
  const beats = useRef<{ targets: number[]; results: (BeatResult | null)[]; i: number }>({ targets: [], results: [], i: 0 });
  const [beatView, setBeatView] = useState<(string | null)[]>([]);
  const [fx, setFx] = useState<Fx[]>([]);
  const [combo, setCombo] = useState(0);
  const [cuts, setCuts] = useState<{ x: number; y: number; a: number }[]>([]);
  const fxId = useRef(0);
  const altCount = useRef(0);
  const [altProgress, setAltProgress] = useState(0);

  const targets = useMemo(() => beatTargets(step, cook.attemptId || 'first'), [step, cook.attemptId]);

  const addFx = useCallback((f: Omit<Fx, 'id'>, ttl = 650) => {
    const id = ++fxId.current;
    setFx((list) => [...list.slice(-12), { ...f, id }]);
    window.setTimeout(() => setFx((list) => list.filter((x) => x.id !== id)), ttl);
  }, []);

  // ---- bridge: chef preps automatically (short) ----------------------------------------------
  useEffect(() => {
    if (sub !== 'bridge') return;
    const frames = Math.max(1, stage.bridge.length);
    const per = reduced ? PACE.bridgeFrameReducedMs : PACE.bridgeFrameMs;
    let i = 0;
    setBridgeFrame(0);
    const id = window.setInterval(() => {
      i += 1;
      if (i < frames) { setBridgeFrame(i); sfx.chop(); }
      else { window.clearInterval(id); dispatch({ type: 'BRIDGE_DONE' }); }
    }, per);
    return () => window.clearInterval(id);
  }, [sub, cook.stepIndex, stage, dispatch, setBridgeFrame, reduced]);

  // ---- instruction: flash the verb, then go (no Ready button) ----------------------------------
  useEffect(() => {
    if (sub !== 'instruction') return;
    const first = !seenGestures.has(g);
    const id = window.setTimeout(() => { seenGestures.add(g); dispatch({ type: 'READY' }); }, first ? PACE.firstTimePromptMs : PACE.promptMs);
    return () => window.clearTimeout(id);
  }, [sub, g, dispatch, cook.stepIndex]);

  useEffect(() => {
    if (sub !== 'countin') return;
    const id = window.setTimeout(() => { startPerf.current = performance.now(); dispatch({ type: 'COUNTIN_DONE' }); }, PACE.countInMs);
    return () => window.clearTimeout(id);
  }, [sub, cook.attemptId, dispatch]);

  // ---- resolving beats -----------------------------------------------------------------------
  const finish = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    stepClock.running = false; pointer.active = false;
    const b = beats.current.results.map((r) => r ?? { grade: 'Miss' as const, points: 0, error_ms: null });
    const combined = combineBeats(b);
    window.setTimeout(() => dispatch({ type: 'SUBMIT', eventMs: null, graded: { grade: combined.grade, error_ms: combined.error_ms }, assistedInput: altCount.current > 0 }), 260);
  }, [dispatch]);

  const resolveBeat = useCallback((eventMs: number | null, at?: { x: number; y: number }) => {
    const B = beats.current;
    if (submitted.current || B.i >= B.targets.length) return;
    const nowMs = performance.now() - startPerf.current;
    // An input arriving after this beat's window has closed (the frame loop can lag on slow
    // devices) closes the beat as a Miss; it is not carried over to the next slice.
    const late = eventMs !== null && eventMs > beatExpiresAt(g, B.targets[B.i], mult);
    const res = late ? { grade: 'Miss' as const, points: 0, error_ms: null } : gradeBeat(g, B.targets[B.i], eventMs, mult);
    B.results[B.i] = res;
    B.i += 1;
    // Each follow-up beat gets its own fresh ring that starts right after this one resolved.
    if (B.i < B.targets.length) B.targets[B.i] = nextBeatTarget(step, cook.attemptId || 'first', B.i, Math.max(nowMs, eventMs ?? 0));
    if (import.meta.env.DEV) Object.assign(window, { __beats: { ...(window as unknown as { __beats: object }).__beats, targets: [...B.targets], i: B.i } });
    setBeatView(B.results.map((r) => r?.grade ?? null));
    const pos = at ?? (geo ? { x: geo.target.x, y: geo.target.y } : { x: 0, y: 0 });
    addFx({ kind: 'pop', x: pos.x, y: pos.y - 56, word: POP_WORD[res.grade], grade: res.grade }, 750);
    if (res.grade === 'Miss') { sfx.miss(); setCombo(0); emitCue({ type: 'wobble' }); }
    else {
      setCombo((c) => c + 1);
      if (res.grade === 'Perfect') sfx.perfect(); else if (res.grade === 'Good') sfx.good(); else sfx.ok();
      emitCue({ type: 'wobble' });
    }
    if (B.i >= B.targets.length) finish();
  }, [g, mult, geo, addFx, finish, step, cook.attemptId]);

  // ---- active phase: clock, ring, recognizers ------------------------------------------------
  useEffect(() => {
    if (sub !== 'active' || !geo) return;
    if (!startPerf.current || performance.now() - startPerf.current > 1500) startPerf.current = performance.now();
    submitted.current = false;
    altCount.current = 0; setAltProgress(0);
    beats.current = { targets, results: targets.map(() => null), i: 0 };
    setBeatView(targets.map(() => null));
    setCuts([]);
    mixing.progress = 0;
    Object.assign(stepClock, { running: true, startPerf: startPerf.current, targetMs: targets[targets.length - 1], durationMs: beatExpiresAt(g, targets[targets.length - 1], mult) });
    if (import.meta.env.DEV) Object.assign(window, { __beats: { start: startPerf.current, targets, gesture: g, mult } });

    const R = g === 'circle' ? 0.2 * geo.W : Math.max(geo.target.r * 1.2, 34);
    const cx = (geo.target.x - geo.left) / geo.W, cy = (geo.target.y - geo.top) / geo.W;
    const slicer = g === 'swipe' ? new SliceRecognizer({ cx, cy, r: R / geo.W }) : null;
    const tapper = g === 'tap' ? new TapRecognizer({ x: cx, y: cy, radius: R / geo.W }) : null;
    const circler = g === 'circle' ? new CircleRecognizer({ cx, cy }) : null;

    // pointer handling
    const el = layerRef.current!;
    let activeId: number | null = null;
    const trail: string[] = [];
    const toSample = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      return { x: (px - geo.left) / geo.W, y: (py - geo.top) / geo.W, t: ev.timeStamp - startPerf.current, pointerId: ev.pointerId, px, py };
    };
    const open = () => {
      const B = beats.current;
      return B.i < B.targets.length && performance.now() - startPerf.current >= beatOpensAt(g, B.targets[B.i], B.i);
    };
    const handleCuts = () => {
      if (!slicer) return;
      for (const c of slicer.take()) {
        const x = geo.left + c.x * geo.W, y = geo.top + c.y * geo.W;
        addFx({ kind: 'slash', x, y, angle: (c.angle * 180) / Math.PI }, 420);
        addFx({ kind: 'splash', x, y, color: juice }, 600);
        sfx.chop();
        if (open()) { setCuts((l) => [...l, { x, y, a: c.angle }]); resolveBeat(c.t, { x, y }); }
        else if (hintRef.current) hintRef.current.textContent = 'Wait for the ring!';
      }
    };
    const down = (e: PointerEvent) => {
      unlockAudio();
      if (submitted.current || (activeId !== null && e.pointerId !== activeId)) return;
      activeId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const s = toSample(e);
      pointer.active = true; pointer.x = s.px; pointer.y = s.py;
      trail.length = 0; trail.push(`${s.px},${s.py}`);
      if (hintRef.current) hintRef.current.textContent = '';
      slicer?.down(s); circler?.down(s);
      if (tapper) {
        tapper.reset(); tapper.down(s);
        if (tapper.result && open()) {
          addFx({ kind: 'tapburst', x: geo.target.x, y: geo.target.y }, 500);
          resolveBeat(tapper.result.eventMs);
        } else if (tapper.result && hintRef.current) hintRef.current.textContent = 'Wait for the ring!';
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== activeId || submitted.current) return;
      const evs = (e.getCoalescedEvents?.() ?? []).length ? e.getCoalescedEvents() : [e];
      let lastP = circler?.progress ?? 0;
      for (const ev of evs) {
        const s = toSample(ev);
        slicer?.move(s); circler?.move(s);
        pointer.x = s.px; pointer.y = s.py;
        trail.push(`${s.px},${s.py}`);
        if (circler) {
          mixing.angle = Math.atan2(s.y - cy, s.x - cx);
          if (circler.progress - lastP > 0.06) { sfx.stir(); lastP = circler.progress; }
        }
      }
      if (trail.length > 14) trail.splice(0, trail.length - 14);
      trailRef.current?.setAttribute('points', trail.join(' '));
      handleCuts();
      if (circler?.result) resolveBeat(circler.result.eventMs);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      const s = toSample(e);
      slicer?.up(s); circler?.up(s);
      activeId = null; pointer.active = false;
      window.setTimeout(() => trailRef.current?.setAttribute('points', ''), 90);
      handleCuts();
      if (circler && !circler.result && circler.feedback && hintRef.current) hintRef.current.textContent = circler.feedback === 'outside_ring' ? 'Stay on the ring!' : 'Keep stirring — two whole circles!';
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      slicer?.cancel(); circler?.cancel(e.pointerId);
      activeId = null; pointer.active = false;
      trailRef.current?.setAttribute('points', '');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);

    // frame loop: closing ring + expiry
    let raf = 0;
    const w = ARCADE_WINDOWS[g];
    const loop = () => {
      const t = performance.now() - startPerf.current;
      const B = beats.current;
      if (!submitted.current && B.i < B.targets.length && t > beatExpiresAt(g, B.targets[B.i], mult)) resolveBeat(null);
      const ring = ringRef.current;
      if (ring && B.i < B.targets.length) {
        const target = B.targets[B.i];
        const lead = beatLead(g, B.i);
        const k = Math.max(0, Math.min(1, (target - t) / lead));
        const visible = t >= target - lead;
        const err = Math.abs(t - target);
        ring.setAttribute('r', String(R * (1 + (g === 'circle' ? 1.1 : 2.3) * k)));
        ring.style.opacity = visible ? '1' : '0';
        ring.style.stroke = err <= w.perfect * mult ? '#FFD84A' : err <= w.good * mult ? '#7CD14E' : t < target ? (k > 0.5 ? '#FFFFFF' : '#FF9F43') : '#FF6B5A';
        ring.style.strokeWidth = err <= w.good * mult ? '9' : '6';
      } else if (ring) ring.style.opacity = '0';
      if (progressRef.current && circler) {
        mixing.progress = circler.progress;
        const C = 2 * Math.PI * R;
        progressRef.current.style.strokeDasharray = `${C * Math.max(circler.progress, altCount.current / 4)} ${C}`;
      }
      if (!submitted.current) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      stepClock.running = false; pointer.active = false;
    };
    // geometry is captured once per attempt (anchors come from the settled camera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, cook.attemptId]);

  // ---- alternate (button / keyboard) input: same cue, recorded as assisted --------------------
  const altAction = useCallback(() => {
    if (sub !== 'active' || submitted.current) return;
    unlockAudio();
    const t = performance.now() - startPerf.current;
    if (g === 'circle') {
      altCount.current += 1; setAltProgress(altCount.current); sfx.stir();
      if (altCount.current >= 4) resolveBeat(t);
    } else {
      altCount.current += 1;
      if (geo && g === 'swipe') addFx({ kind: 'slash', x: geo.target.x, y: geo.target.y, angle: 70 }, 420);
      resolveBeat(t);
    }
  }, [sub, g, resolveBeat, geo, addFx]);

  // ---- feedback / miss reactions --------------------------------------------------------------
  const last = cook.lastResult;
  useEffect(() => {
    if (sub === 'feedback' && last) {
      const gr = last.grade;
      if (gr === 'Perfect') emitCue({ type: 'chef', anim: 'cheer' });
      else if (gr === 'Good') emitCue({ type: 'chef', anim: 'clap' });
      else emitCue({ type: 'chef', anim: 'nod' });
      const id = window.setTimeout(() => dispatch({ type: 'FEEDBACK_DONE' }), PACE.feedbackMs);
      return () => window.clearTimeout(id);
    }
    if (sub === 'miss') { emitCue({ type: 'chef', anim: 'tilt' }); setCombo(0); }
  }, [sub, last, dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      if ((e.key === ' ' || e.key === 'Enter') && sub === 'active') { e.preventDefault(); altAction(); }
      else if (sub === 'miss' && (e.key === 'r' || e.key === 'R')) dispatch({ type: 'RETRY_STEP' });
      else if (sub === 'miss' && (e.key === 'c' || e.key === 'C')) dispatch({ type: 'CONTINUE_WITH_HELP' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sub, dispatch, altAction]);

  // ---- chef speech -------------------------------------------------------------------------
  const chefSays = useMemo(() => {
    if (sub === 'bridge') return stage.bridgeLines[Math.min(bridgeFrame, stage.bridgeLines.length - 1)] ?? 'Let me get this ready…';
    if (sub === 'instruction' || sub === 'countin' || sub === 'active') return HOWTO[g];
    if (sub === 'feedback' && last) {
      if (cook.helped) return 'I’ll help with that one. No apples lost!';
      const lines = GRADE_LINE[last.grade] ?? ['Nice!'];
      return `${lines[cook.attemptSeq % lines.length]} ${stage.praise}`;
    }
    if (sub === 'miss') {
      const e = last?.error_ms;
      if (e === null || e === undefined) return 'Too slow — the ring closed! Again?';
      return e < 0 ? 'A bit early! Again?' : 'A bit late! Again?';
    }
    return '';
  }, [sub, bridgeFrame, stage, last, cook.helped, cook.attemptSeq, g]);

  const tgt = geo?.target;
  const R = geo && tgt ? (g === 'circle' ? 0.2 * geo.W : Math.max(tgt.r * 1.2, 34)) : 0;
  const showTarget = !!tgt && (sub === 'instruction' || sub === 'countin' || sub === 'active');
  const firstTime = !seenGestures.has(g);

  return (
    <div className={`cook-layer ${sub === 'active' && combo >= 3 ? 'hot' : ''}`}>
      <ChefBubble text={chefSays} />
      <div ref={layerRef} className={`gesture-layer ${sub === 'active' ? 'live' : ''}`} data-testid="gesture-layer">
        {showTarget && tgt && (
          <svg className="guides" width="100%" height="100%">
            <circle cx={tgt.x} cy={tgt.y} r={R} className={`target-ring g-${g}`} data-testid="target-ring" />
            {g === 'circle' && <circle ref={progressRef} cx={tgt.x} cy={tgt.y} r={R} className="mix-progress" transform={`rotate(-90 ${tgt.x} ${tgt.y})`} />}
            {g === 'swipe' && (sub === 'active') && (
              <g clipPath="url(#fruit-clip)">
                <defs><clipPath id="fruit-clip"><circle cx={tgt.x} cy={tgt.y} r={R * 0.92} /></clipPath></defs>
                {cuts.map((c, i) => {
                  const dx = Math.cos(c.a) * R * 2, dy = Math.sin(c.a) * R * 2;
                  return <line key={i} x1={c.x - dx} y1={c.y - dy} x2={c.x + dx} y2={c.y + dy} className="cut-mark" />;
                })}
              </g>
            )}
            {sub === 'active' && <circle ref={ringRef} cx={tgt.x} cy={tgt.y} r={R * 3} className="closing-ring" style={{ opacity: 0 }} />}
            {sub === 'active' && targets.length > 1 && (() => {
              const done = beatView.filter(Boolean).length;
              return done < targets.length ? (
                <text key={done} x={tgt.x} y={tgt.y + R + 30} className="beat-label" textAnchor="middle" data-testid="beat-label">
                  {g === 'swipe' ? 'Slice' : 'Beat'} {done + 1}/{targets.length}
                </text>
              ) : null;
            })()}
            <polyline ref={trailRef} className={`trail ${g === 'swipe' ? 'blade' : ''}`} points="" />
          </svg>
        )}
        {fx.map((f) => <FxView key={f.id} f={f} skin={skin} />)}
        {sub === 'instruction' && tgt && (
          <div className="verb-flash" key={cook.attemptId + cook.stepIndex}>
            <span>{VERB[g]}</span>
          </div>
        )}
        {sub === 'instruction' && firstTime && tgt && <HintHand gesture={g} x={tgt.x} y={tgt.y} r={R} reduced={reduced} />}
        <div ref={hintRef} className="soft-hint" role="status" aria-live="polite" />
        {combo >= 2 && sub === 'active' && <div className="combo" key={combo}>Combo ×{combo}</div>}
        {sub === 'feedback' && last && (
          <div className={`grade-pop grade-${cook.helped ? 'help' : last.grade}`} key={cook.attemptId + last.grade} role="status">
            {cook.helped ? 'Helped' : last.grade}
          </div>
        )}
      </div>

      <div className="cook-panel slim" data-testid="cook-panel">
        <div className="hud-row">
          <GestureIcon g={g} />
          <div className="hud-text">
            <div className="step-label">{step.label}</div>
            <StepDots index={cook.stepIndex} gestures={recipe.steps.map((s) => s.gesture)} results={cook.stepResults.map((r) => r.grade)} />
          </div>
          <BeatPips n={targets.length} view={sub === 'active' || sub === 'feedback' ? beatView : []} />
        </div>
        <div className="cook-actions">
          {sub === 'active' && alt && (
            <button className="btn primary big" data-testid="alt-action" onClick={altAction}>
              {g === 'tap' ? 'Tap now' : g === 'swipe' ? 'Slice now' : `Stir (${altProgress}/4)`}
            </button>
          )}
          {sub === 'miss' && (
            <div className="miss-box" role="dialog" aria-label="Missed step">
              <div className="row">
                <button className="btn primary" data-testid="retry" onClick={() => dispatch({ type: 'RETRY_STEP' })}>Try again</button>
                <button className="btn" data-testid="continue-help" onClick={() => dispatch({ type: 'CONTINUE_WITH_HELP' })}>Chef, help!</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {stages.length === 0 && null}
    </div>
  );
}

function FxView({ f, skin }: { f: Fx; skin: string }) {
  if (f.kind === 'slash') {
    return <div className="fx-slash" style={{ left: f.x, top: f.y, transform: `translate(-50%,-50%) rotate(${f.angle ?? 0}deg)` }} />;
  }
  if (f.kind === 'splash') {
    return (
      <div className="fx-splash" style={{ left: f.x, top: f.y }}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2 + (f.id % 5) * 0.3;
          const d = 38 + ((i * 37 + f.id * 11) % 34);
          return <i key={i} style={{ background: i % 3 === 0 ? skin : f.color, ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d}px`, width: 6 + (i % 3) * 3, height: 6 + (i % 3) * 3 }} />;
        })}
      </div>
    );
  }
  if (f.kind === 'tapburst') return <div className="fx-burst" style={{ left: f.x, top: f.y }} />;
  return <div className={`fx-pop pop-${f.grade}`} style={{ left: f.x, top: f.y }}>{f.word}</div>;
}

function ChefBubble({ text }: { text: string }) {
  const { anchors, w } = useAnchors();
  const chef = useContext(ChefContext);
  const head = anchors.chefHead;
  if (!text) return null;
  const top = head ? Math.max(58, head.y - 70) : 70;
  const left = head ? Math.min(Math.max(head.x + 46, w * 0.36), w - 200) : w * 0.4;
  return (
    <div className="chef-bubble" style={{ top, left }} role="status" aria-live="polite" data-testid="chef-bubble">
      <span className="who">Chef {chef.name}</span>
      {text}
    </div>
  );
}

function StepDots({ index, gestures, results }: { index: number; gestures: string[]; results: string[] }) {
  return (
    <div className="step-dots" aria-label={`Step ${index + 1} of ${gestures.length}`}>
      {gestures.map((gg, i) => (
        <div key={i} className={`dot ${i < index ? 'done' : i === index ? 'now' : ''}`} title={gg}>
          {i < index && results[i] ? (results[i] === 'Perfect' ? '★' : results[i] === 'Miss' ? '·' : '✓') : i + 1}
        </div>
      ))}
    </div>
  );
}

function BeatPips({ n, view }: { n: number; view: (string | null)[] }) {
  return (
    <div className="beat-pips" aria-label={`${n} ${n === 1 ? 'beat' : 'beats'}`}>
      {Array.from({ length: n }, (_, i) => <span key={i} className={`pip ${view[i] ? `p-${view[i]}` : ''}`} />)}
    </div>
  );
}

function HintHand({ gesture, x, y, r, reduced }: { gesture: StepDef['gesture']; x: number; y: number; r: number; reduced: boolean }) {
  return (
    <div className={`hint-hand ${gesture} ${gesture === 'swipe' ? 'v' : ''} ${reduced ? 'still' : ''}`} style={{ left: x, top: y, ['--r' as string]: `${r}px` }} aria-hidden>
      <div className="finger" />
    </div>
  );
}
