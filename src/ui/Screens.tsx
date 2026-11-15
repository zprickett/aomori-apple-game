import { useEffect, useRef, useState } from 'react';
import { GOLDEN_LABEL, apple, chefLevel, recipe, selectors, type GameAction, type GameState } from '../core/index.ts';
import { useAnchors, emitCue } from '../game/bus.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { appleIcon, dishIcon, Stars } from './icons.tsx';

type D = (a: GameAction) => void;

const FIT_WORD = ['Bad fit', 'OK', 'Good', 'Best'];

// ---------------------------------------------------------------------------
export function ShopOverlay({ state, dispatch }: { state: GameState; dispatch: D }) {
  const { anchors, w } = useAnchors();
  const o = state.order;
  const r = recipe(o.recipeId);
  const head = anchors.customerHead;
  const isPractice = state.mode === 'practice';
  return (
    <>
      <div
        className="order-bubble"
        style={head ? { ['--tail-x' as string]: `${Math.min(85, Math.max(15, (head.x / Math.max(1, w)) * 100))}%` } : undefined}
        data-testid="order-bubble"
        key={o.orderId}
      >
        <img src={dishIcon(r.id)} alt="" className="order-dish" />
        <div className="order-text">
          <div className="order-kicker">{o.intro ? 'New recipe!' : `Order ${o.orderNumber}`}</div>
          <div className="order-name">{r.name}</div>
          <div className="order-line">“{o.line}”</div>
          {o.suggestedAppleId && state.progress.unlockedApples.includes(o.suggestedAppleId) && (
            <div className="order-hint"><img src={appleIcon(o.suggestedAppleId)} alt="" /> Try {apple(o.suggestedAppleId).nameEn}?</div>
          )}
        </div>
      </div>
      <div className="bottom-cta">
        {!isPractice && (
          <button className="btn primary huge" data-testid="accept" onClick={() => { unlockAudio(); sfx.tap(); dispatch({ type: 'ACCEPT_ORDER' }); }}>
            Let’s cook!
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function AppleDrawer({ state, dispatch }: { state: GameState; dispatch: D }) {
  const cards = selectors.appleCards(state);
  const r = selectors.activeRecipe(state);
  const sel = state.previewAppleId ? apple(state.previewAppleId) : null;
  const fit = selectors.previewFit(state);
  const sizeMismatch = r.id === 'ringo_ame' && sel && sel.sizeClass !== 'mini';
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => { detailRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [state.previewAppleId]);
  return (
    <div className="drawer" role="dialog" aria-label="Choose an apple" data-testid="apple-drawer">
      <div className="drawer-head">
        <button className="btn small ghost" onClick={() => dispatch({ type: 'BACK' })} data-testid="back">‹ Back</button>
        <div className="drawer-title">
          <img src={dishIcon(r.id)} alt="" />
          <div className="t">{r.name}</div>
        </div>
      </div>
      <div className="apple-grid">
        {cards.map((c) => (
          <button
            key={c.apple.id}
            className={`apple-card ${c.unlocked ? '' : 'locked'} ${state.previewAppleId === c.apple.id ? 'sel' : ''}`}
            disabled={!c.unlocked}
            onClick={() => { sfx.tap(); dispatch({ type: 'PREVIEW_APPLE', appleId: c.apple.id }); }}
            aria-pressed={state.previewAppleId === c.apple.id}
            aria-label={c.unlocked ? `${c.apple.nameEn}, ${FIT_WORD[c.fitStars ?? 0]} for ${r.name}` : `Locked apple. ${c.unlockText}`}
            data-testid={`apple-${c.apple.id}`}
          >
            <img src={appleIcon(c.apple.id)} alt="" className={c.unlocked ? '' : 'sil'} />
            {c.unlocked && <span className={`size-chip s-${c.apple.sizeLabel}`} aria-label={`Size ${c.apple.sizeLabel}`}>{c.apple.sizeLabel}</span>}
            {c.unlocked ? (
              <>
                <span className="nm">{c.apple.nameEn.replace(' (Jonathan)', '')}</span>
                <Stars n={c.fitStars ?? 0} size={13} />
              </>
            ) : (
              <span className="nm lock">🔒 {c.unlockText.replace('Arrives after ', 'After ')}</span>
            )}
          </button>
        ))}
      </div>
      <div className="apple-detail" ref={detailRef} aria-live="polite">
        {sel ? (
          <>
            <div className="ad-head">
              <img src={appleIcon(sel.id)} alt="" />
              <div>
                <div className="ad-name">{sel.nameEn} <span className="ja" lang="ja">{sel.nameJa}</span></div>
                <div className="ad-size"><span className={`size-chip inline s-${sel.sizeLabel}`}>{sel.sizeLabel}</span> about {sel.weightG} g</div>
                <div className="ad-trait">{sel.traitHint}</div>
              </div>
            </div>
            {fit === 0 && <div className="ad-note">Not a good fit here. Try this apple in another dish!</div>}
            {sizeMismatch && <div className="ad-note">This apple is big for a mini candy apple — it stays whole, but a small apple fits best.</div>}
            <button className="btn primary huge" data-testid="confirm-apple" onClick={() => { unlockAudio(); sfx.pop(); dispatch({ type: 'CONFIRM_APPLE' }); }}>
              Use {sel.nameEn.replace(' (Jonathan)', '')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ServeOverlay({ state, dispatch, reduced }: { state: GameState; dispatch: D; reduced: boolean }) {
  useEffect(() => {
    emitCue({ type: 'chef', anim: 'serve' });
    sfx.bell();
    const id = window.setTimeout(() => dispatch({ type: 'SERVE_DONE' }), reduced ? 900 : 1800);
    return () => window.clearTimeout(id);
  }, [dispatch, reduced]);
  const r = selectors.activeRecipe(state);
  return (
    <div className="serve-banner" role="status">
      <div className="serve-text">Here’s your {r.name}!</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const GRADE_CLASS: Record<string, string> = { Perfect: 'g-perfect', Good: 'g-good', OK: 'g-ok', Miss: 'g-miss' };

export function useCountUp(target: number, ms: number, reduced: boolean, delay = 0): number {
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const f = Math.min(1, Math.max(0, (t - t0) / ms));
      setV(Math.round(target * (1 - Math.pow(1 - f, 3))));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced, delay]);
  return v;
}

export function LevelBar({ before, after, reduced }: { before: number; after: number; reduced: boolean }) {
  const shown = useCountUp(after - before, 900, reduced, 700) + before;
  const lv = chefLevel(shown);
  const up = chefLevel(after).level > chefLevel(before).level && shown >= chefLevel(after).floor;
  return (
    <div className={`level-bar ${up ? 'up' : ''}`} data-testid="level-bar">
      <div className="lv-row">
        <span className="lv-badge">Lv {lv.level}</span>
        <span className="lv-title">{lv.title}</span>
        {up && <span className="lv-up">LEVEL UP!</span>}
        <span className="lv-pts">{shown.toLocaleString()} pts</span>
      </div>
      <div className="lv-track"><i style={{ width: `${Math.round(lv.frac * 100)}%` }} /></div>
    </div>
  );
}

export function ResultCard({ state, dispatch, reduced }: { state: GameState; dispatch: D; reduced: boolean }) {
  const res = state.result;
  const pr = state.practiceResult;
  const r = selectors.activeRecipe(state);
  const a = state.appleId ? apple(state.appleId) : null;
  const score = res?.score ?? null;
  const record = res ? state.progress.history.find((h) => h.orderId === state.order.orderId) : undefined;
  const after = state.progress.totalPoints;
  const before = after - (record?.points ?? 0);
  const shown = useCountUp(score?.total ?? 0, 800, reduced, 250);
  useEffect(() => {
    if (!score) return;
    const f = score.max ? score.total / score.max : 0;
    const n = score.golden ? 3 : f >= 0.6 ? 2 : f > 0 ? 1 : 0;
    emitCue({ type: 'customer', anim: n >= 3 ? 'joy' : n >= 1 ? 'happy' : 'think' });
    if (n >= 3) emitCue({ type: 'chef', anim: 'cheer' });
    for (let i = 0; i < n; i++) window.setTimeout(() => sfx.star(i), 350 + i * 260);
    if (n >= 3 || record?.newBest) window.setTimeout(() => sfx.fanfare(), 350 + 3 * 260);
  }, [score, record?.newBest]);
  return (
    <div className="sheet-card result" role="dialog" aria-label="Dish result" data-testid="result-card">
      <div className="res-head">
        <img src={dishIcon(r.id)} alt="" />
        <div className="res-main">
          <div className="kicker">{a ? `${a.nameEn.replace(' (Jonathan)', '')} · ${r.name}` : r.name}</div>
          {score && res ? (
            <>
              <div className="res-points" data-testid="points"><b>{shown.toLocaleString()}</b> pts
                {record?.newBest && <span className="new-best">NEW BEST!</span>}
              </div>
              {score.golden && <div className="golden-badge" data-testid="golden">🏆 {GOLDEN_LABEL}</div>}
            </>
          ) : (
            <div className="res-label">Practice done. Just for fun!</div>
          )}
        </div>
      </div>
      <div className="res-grades">
        {(res?.grades ?? pr?.grades ?? []).map((g, i) => (
          <span key={g.stepId} className={`chip ${GRADE_CLASS[g.grade]}`}>{i + 1}. {g.grade}</span>
        ))}
        {score && <span className={`chip apple-x f-${score.fit}`}>🍎 ×{score.appleMultiplier}</span>}
        {score && score.combo > 0 && <span className="chip combo-chip">🔥 +{score.combo}</span>}
      </div>
      {score && <LevelBar before={before} after={after} reduced={reduced} />}
      <button className="btn primary huge" data-testid="result-next" onClick={() => { sfx.tap(); dispatch({ type: 'RESULT_DONE' }); }}>
        {pr ? 'Back to the shop' : state.delivery ? 'A delivery is here!' : 'Next customer'}
      </button>
    </div>
  );
}
