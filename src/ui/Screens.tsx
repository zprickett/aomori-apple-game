import { useContext, useEffect, useRef, useState } from 'react';
import { DAY_LENGTH, GOLDEN_LABEL, apple, fitReason, recipe, requestDishName, selectors, withName, type GameAction, type GameState } from '../core/index.ts';
import { LadderBar } from './Ranks.tsx';
import { ChefContext } from '../game/chef.ts';
import { useAnchors, emitCue } from '../game/bus.ts';
import { sfx, unlockAudio } from '../game/audio.ts';
import { appleIcon, dishIcon, portrait, Stars } from './icons.tsx';

type D = (a: GameAction) => void;

const FIT_WORD = ['Bad fit', 'OK', 'Good', 'Best'];

// ---------------------------------------------------------------------------
export function ShopOverlay({ state, dispatch }: { state: GameState; dispatch: D }) {
  const { anchors, w } = useAnchors();
  const o = state.order;
  const r = recipe(o.recipeId);
  const head = anchors.customerHead;
  const isPractice = state.mode === 'practice';
  const chef = useContext(ChefContext);
  const firstOrder = !isPractice && state.progress.completedOrders === 0;
  const tailX = head ? { ['--tail-x' as string]: `${Math.min(85, Math.max(15, (head.x / Math.max(1, w)) * 100))}%` } : undefined;
  const offer = !isPractice ? state.choice.offer : null;
  if (offer) return <ChoosePair state={state} dispatch={dispatch} name={chef.name} />;
  return (
    <>
      {o.visit ? (
        <StoryBubble state={state} tailX={tailX} name={chef.name} />
      ) : (
        <div className="order-bubble" style={tailX} data-testid="order-bubble" key={o.orderId}>
          <img src={dishIcon(r.id)} alt="" className="order-dish" />
          <div className="order-text">
            <div className="order-kicker">{o.intro ? 'New recipe!' : `Order ${o.orderNumber}`}</div>
            <div className="order-name">{r.name}</div>
            <div className="order-line">“{withName(o.line, chef.name)}”</div>
            <AppleHint state={state} />
          </div>
        </div>
      )}
      <div className="bottom-cta">
        {firstOrder && (
          <div className="first-order" data-testid="first-order">
            <span className="fo-spark" aria-hidden>✨</span> Let’s make your first order! <span className="fo-spark" aria-hidden>✨</span>
          </div>
        )}
        {!isPractice && (
          <button className={`btn primary huge ${firstOrder ? 'pulse' : ''}`} data-testid="accept"
            onClick={() => { unlockAudio(); sfx.tap(); dispatch({ type: 'ACCEPT_ORDER' }); }}>
            Let’s cook!
          </button>
        )}
      </div>
    </>
  );
}


/**
 * Two customers waiting: the kid taps who to serve. The card on the left belongs to the customer
 * standing on the left (the offer), the right one to the customer at the counter (the queue's order).
 */
function ChoosePair({ state, dispatch, name }: { state: GameState; dispatch: D; name: string }) {
  const { main, offer } = state.choice;
  const pick = (which: 'main' | 'offer') => { unlockAudio(); sfx.tap(); dispatch({ type: 'ACCEPT_ORDER', pick: which }); };
  const card = (o: typeof main, which: 'main' | 'offer') => {
    const r = recipe(o.recipeId);
    return (
      <button key={which} className={`choice-card ${which}`} data-testid={`choice-${which}`} onClick={() => pick(which)}>
        <span className="cc-face" style={{ backgroundImage: `url(${portrait(o.customerId)})` }} aria-hidden />
        {o.waited && <span className="cc-wait">Waiting</span>}
        <img src={dishIcon(r.id)} alt="" className="cc-dish" />
        <span className="cc-name">{r.name}</span>
        <span className="cc-line">“{withName(o.line, name)}”</span>
        {o.suggestedAppleId && state.progress.unlockedApples.includes(o.suggestedAppleId) && (
          <span className="cc-hint"><img src={appleIcon(o.suggestedAppleId)} alt="" /> {apple(o.suggestedAppleId).nameEn}</span>
        )}
      </button>
    );
  };
  return (
    <>
      <div className="choice-pair" data-testid="choice-pair">
        <div className="cp-kicker">Order {main.orderNumber} · Who will you serve?</div>
        <div className="cp-cards">{card(offer!, 'offer')}{card(main, 'main')}</div>
      </div>
      <div className="bottom-cta"><div className="cp-tip">Tap a customer to cook their dish!</div></div>
    </>
  );
}

function AppleHint({ state }: { state: GameState }) {
  const o = state.order;
  if (!o.suggestedAppleId || !state.progress.unlockedApples.includes(o.suggestedAppleId)) return null;
  return <div className="order-hint"><img src={appleIcon(o.suggestedAppleId)} alt="" /> Try {apple(o.suggestedAppleId).nameEn}?</div>;
}

/**
 * A regular's (or Ojiichan's) order: their own colour, a portrait, their name big with who they
 * are, and hearts for how far along their story is. Everyday customers keep the plain bubble.
 */
function StoryBubble({ state, tailX, name }: { state: GameState; tailX?: React.CSSProperties; name: string }) {
  const o = state.order;
  const v = o.visit!;
  const r = recipe(o.recipeId);
  return (
    <div className={`order-bubble story s-${v.who}`} data-testid="order-bubble" key={o.orderId}
      style={{ ...tailX, ['--who' as string]: v.color }}>
      <div className="sb-head">
        <div className="sb-face" style={{ backgroundImage: `url(${portrait(v.customerId)})` }} aria-hidden />
        <div className="sb-who">
          <div className="sb-name">{v.visitorName}</div>
          <div className="sb-tag">{v.tagline}</div>
        </div>
        {v.of > 1 && (
          <div className="sb-hearts" aria-label={`Story visit ${v.step} of ${v.of}`}>
            {Array.from({ length: v.of }, (_, i) => <span key={i} className={i < v.step ? 'on' : ''}>♥</span>)}
          </div>
        )}
      </div>
      <div className="sb-line">“{withName(o.line, name)}”</div>
      <div className="sb-dish">
        <img src={dishIcon(r.id)} alt="" />
        <b>{r.name}</b>
        {o.intro && <span className="sb-new">New recipe!</span>}
      </div>
      <AppleHint state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AppleDrawer({ state, dispatch }: { state: GameState; dispatch: D }) {
  const cards = selectors.appleCards(state);
  const cooked = selectors.cookedApples(state);
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
            aria-label={c.unlocked ? `${c.apple.nameEn}, ${FIT_WORD[c.fitStars ?? 0]} for ${r.name}${cooked.has(c.apple.id) ? ', cooked before' : ''}` : `Locked apple. ${c.unlockText}`}
            data-testid={`apple-${c.apple.id}`}
          >
            {c.unlocked && cooked.has(c.apple.id) && <span className="cooked-tick" aria-hidden>✓</span>}
            <img src={appleIcon(c.apple.id)} alt="" className={c.unlocked ? '' : 'sil'} />
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
                <div className="ad-trait">{sel.traitHint}</div>
              </div>
            </div>
            <div className={`ad-why f-${fit ?? 0}`} data-testid="fit-reason"><Stars n={fit ?? 0} size={14} /> {fitReason(sel.id, r.id)}</div>
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
      <div className="serve-text">Here’s your {state.request ? requestDishName(state.request.id, state.request.dishIndex) : r.name}!</div>
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
  const stars = score?.stars ?? 0;
  useEffect(() => {
    if (!score) return;
    const n = stars;
    emitCue({ type: 'customer', anim: n >= 3 || score.golden ? 'joy' : n >= 1 ? 'happy' : 'think' });
    if (n >= 3 || score.golden) emitCue({ type: 'chef', anim: 'cheer' });
    for (let i = 0; i < n; i++) window.setTimeout(() => sfx.star(i), 350 + i * 260);
    if (n >= 3 || score.golden || record?.newBest || record?.newHigh) window.setTimeout(() => sfx.fanfare(), 350 + 3 * 260);
    if (record?.newHigh) { emitCue({ type: 'chef', anim: 'cheer' }); window.setTimeout(() => sfx.fanfare(), 1900); }
  }, [score, stars, record?.newBest, record?.newHigh]);
  const [info, setInfo] = useState<string | null>(null);
  const fitWord = ['a poor fit', 'an OK fit', 'a good fit', 'the best fit'];
  const done = state.progress.completedOrders;
  const dayEnd = !pr && done > 0 && done % DAY_LENGTH === 0;
  return (
    <div className="sheet-card result" role="dialog" aria-label="Dish result" data-testid="result-card">
      {record?.newHigh && score && (
        <div className="high-burst" data-testid="new-high" aria-label={`New high score: ${score.total}`}>
          <span className="hb-kick">NEW HIGH SCORE!</span>
        </div>
      )}
      <div className="res-head">
        <img src={dishIcon(r.id)} alt="" />
        <div className="res-main">
          <div className="kicker">{a ? `${a.nameEn.replace(' (Jonathan)', '')} · ${r.name}` : r.name}</div>
          {score && res ? (
            <>
              <div className="res-stars" data-testid="dish-stars"><Stars n={stars} size={30} label={`${stars} of 3 stars`} /></div>
              <div className="res-points" data-testid="points"><b>{shown.toLocaleString()}</b> pts
                {record?.newBest && !record.newHigh && <span className="new-best">NEW BEST!</span>}
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
          <button key={g.stepId} type="button" className={`chip ${GRADE_CLASS[g.grade]} ${info === `g${i}` ? 'on' : ''}`}
            onClick={() => setInfo(info === `g${i}` ? null : `g${i}`)}>{i + 1}. {g.grade}</button>
        ))}
        {score && <button type="button" className={`chip apple-x f-${score.fit} ${info === 'apple' ? 'on' : ''}`} onClick={() => setInfo(info === 'apple' ? null : 'apple')}>🍎 ×{score.appleMultiplier}</button>}
        {score && score.combo > 0 && <button type="button" className={`chip combo-chip ${info === 'combo' ? 'on' : ''}`} onClick={() => setInfo(info === 'combo' ? null : 'combo')}>🔥 +{score.combo}</button>}
        {score && score.goldenBonus > 0 && <button type="button" className={`chip golden-chip ${info === 'golden' ? 'on' : ''}`} onClick={() => setInfo(info === 'golden' ? null : 'golden')}>🏆 +{score.goldenBonus}</button>}
      </div>
      {info && (
        <div className="chip-info" role="status" data-testid="chip-info" onClick={() => setInfo(null)}>
          {info.startsWith('g') && (() => {
            const g = (res?.grades ?? pr?.grades ?? [])[Number(info.slice(1))];
            return <><b>Action {Number(info.slice(1)) + 1}: {g?.grade}</b> Perfect scores 100, Good 70, OK 40. Bigger recipes multiply them.</>;
          })()}
          {info === 'apple' && score && <><b>Apple bonus ×{score.appleMultiplier}</b> {a?.nameEn.replace(' (Jonathan)', '')} is {fitWord[score.fit]} for {r.name}. The best apples double your points!</>}
          {info === 'combo' && score && <><b>🔥 Combo +{score.combo}</b> Perfect actions in a row add bonus points.</>}
          {info === 'golden' && score && <><b>🏆 Golden Recipe +{score.goldenBonus}</b> Every action Perfect adds a 25% bonus.</>}
        </div>
      )}
      {score && <LadderBar points={after} before={before} reduced={reduced} />}
      <button className="btn primary huge" data-testid="result-next" onClick={() => { sfx.tap(); dispatch({ type: 'RESULT_DONE' }); }}>
        {pr ? 'Back to the shop'
          : state.delivery?.finale ? 'Ojiichan takes a bite…'
          : state.delivery?.rank ? 'Rank up!'
          : state.delivery?.goldenRank ? 'Golden Chef rank up!'
          : state.delivery && !state.delivery.apples.length && !state.delivery.recipes.length ? 'Stall upgrade!'
          : state.delivery?.recipes.length ? 'New recipe!'
          : state.delivery ? 'New apples!'
          : dayEnd ? 'End of the day' : 'Next customer'}
      </button>
    </div>
  );
}
