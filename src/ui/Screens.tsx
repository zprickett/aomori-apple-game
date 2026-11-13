import { useEffect, useRef } from 'react';
import { apple, recipe, selectors, type GameAction, type GameState } from '../core/index.ts';
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
          <div><div className="kicker">{state.mode === 'practice' ? 'Practice' : 'Pick an apple for'}</div><div className="t">{r.name}</div></div>
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
            <div className="ad-fit">
              <span>Fit for {r.name}:</span> <Stars n={fit ?? 0} size={20} /> <b>{fit === 0 ? 'Bad fit for this recipe' : FIT_WORD[fit ?? 0]}</b>
            </div>
            {fit === 0 && <div className="ad-note">Try this apple in another dish!</div>}
            {sizeMismatch && <div className="ad-note">This apple is big for a mini candy apple — it stays whole, but a small apple fits best.</div>}
            <button className="btn primary huge" data-testid="confirm-apple" onClick={() => { unlockAudio(); sfx.pop(); dispatch({ type: 'CONFIRM_APPLE' }); }}>
              Use {sel.nameEn.replace(' (Jonathan)', '')}
            </button>
          </>
        ) : (
          <div className="ad-empty">Tap an apple to see how well it fits.</div>
        )}
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

export function ResultCard({ state, dispatch }: { state: GameState; dispatch: D }) {
  const res = state.result;
  const pr = state.practiceResult;
  const r = selectors.activeRecipe(state);
  const a = state.appleId ? apple(state.appleId) : null;
  useEffect(() => {
    if (!res) return;
    const s = res.finishedStars;
    emitCue({ type: 'customer', anim: s >= 3 ? 'joy' : s >= 1 ? 'happy' : 'think' });
    if (s >= 3) emitCue({ type: 'chef', anim: 'cheer' });
    for (let i = 0; i < s; i++) window.setTimeout(() => sfx.star(i), 350 + i * 260);
    if (s >= 3) window.setTimeout(() => sfx.fanfare(), 350 + 3 * 260);
  }, [res]);
  return (
    <div className="sheet-card result" role="dialog" aria-label="Dish result" data-testid="result-card">
      <div className="res-head">
        <img src={dishIcon(r.id)} alt="" />
        <div>
          <div className="kicker">{a ? `${a.nameEn} · ${r.name}` : r.name}</div>
          {res ? (
            <>
              <div className="res-stars"><Stars n={res.finishedStars} size={34} /></div>
              <div className="res-label">{res.childFeedback}</div>
            </>
          ) : (
            <div className="res-label">Practice done — no stars, just skills!</div>
          )}
        </div>
      </div>
      {res && <div className="res-explain" data-testid="explanation">{res.explanation}</div>}
      <div className="res-grades">
        {(res?.grades ?? pr?.grades ?? []).map((g, i) => (
          <span key={g.stepId} className={`chip ${GRADE_CLASS[g.grade]}`}>{i + 1}. {g.grade}</span>
        ))}
      </div>
      {res?.tip && <div className="res-tip">💡 {res.tip}</div>}
      <button className="btn primary huge" data-testid="result-next" onClick={() => { sfx.tap(); dispatch({ type: 'RESULT_DONE' }); }}>
        {pr ? 'Back to the shop' : state.delivery ? 'A delivery is here!' : 'Next customer'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function DeliveryCard({ state, dispatch }: { state: GameState; dispatch: D }) {
  const d = state.delivery!;
  useEffect(() => { sfx.fanfare(); emitCue({ type: 'chef', anim: 'cheer' }); }, []);
  return (
    <div className="sheet-card delivery" role="dialog" aria-label="New delivery" data-testid="delivery-card">
      {d.collectionComplete && (
        <div className="complete-banner">🎉 Every prototype apple collected! Free play is open — keep cooking!</div>
      )}
      {d.apples.map((id) => {
        const a = apple(id);
        return (
          <div className="disc" key={id}>
            <div className="kicker">A new crate arrived!</div>
            <img src={appleIcon(id)} alt="" className="disc-img" />
            <div className="disc-name">{a.nameEn} <span className="ja" lang="ja">{a.nameJa}</span></div>
            <div className="disc-trait">{a.traitHint}</div>
          </div>
        );
      })}
      {d.recipes.map((id) => {
        const rr = recipe(id);
        return (
          <div className="disc recipe" key={id}>
            <img src={dishIcon(id)} alt="" className="disc-img small" />
            <div><div className="kicker">New recipe</div><div className="disc-name">{rr.name}</div>
              <div className="disc-trait">{rr.steps.length} {rr.steps.length === 1 ? 'action' : 'actions'}: {[...new Set(rr.steps.map((s) => s.gesture))].join(', ')}</div></div>
          </div>
        );
      })}
      <button className="btn primary huge" data-testid="delivery-done" onClick={() => { sfx.tap(); dispatch({ type: 'DELIVERY_DONE' }); }}>
        Back to the shop
      </button>
    </div>
  );
}
