import { useEffect, useState } from 'react';
import { RECIPES, apple, fitStars, recipe, type GameAction, type GameState } from '../core/index.ts';
import { emitCue } from '../game/bus.ts';
import { sfx } from '../game/audio.ts';
import { Showcase, type ShowcaseItem } from '../three/Showcase.tsx';
import { dishIcon, GestureIcon } from './icons.tsx';

type D = (a: GameAction) => void;

const STAT_LABEL: Record<string, string> = { sweetness: 'Sweet', tartness: 'Tart', juiciness: 'Juicy', raw_firmness: 'Crunchy', aroma: 'Smell' };
const INTRO_MS = 6300;
const shortName = (n: string) => n.replace(' (Jonathan)', '');

/**
 * Unlock celebration: a manga-style entrance (speed lines, halftone, slam-in title, the new apple
 * or dish zooming in) followed by a full-screen overview card. One pass per unlocked item.
 */
export function UnlockReveal({ state, dispatch, reduced }: { state: GameState; dispatch: D; reduced: boolean }) {
  const d = state.delivery!;
  const items: ShowcaseItem[] = [
    ...d.apples.map((id) => ({ kind: 'apple' as const, id })),
    ...d.recipes.map((id) => ({ kind: 'recipe' as const, id })),
  ];
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<'intro' | 'overview'>('intro');
  const item = items[i];
  const last = i >= items.length - 1;

  useEffect(() => {
    if (stage !== 'intro') return;
    sfx.swish();
    const t1 = window.setTimeout(() => { sfx.chop(); sfx.fanfare(); emitCue({ type: 'chef', anim: 'cheer' }); }, reduced ? 0 : 380);
    const t2 = window.setTimeout(() => setStage('overview'), reduced ? 900 : INTRO_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [stage, i, reduced]);

  if (!item) return null;
  const next = () => {
    sfx.tap();
    if (last) dispatch({ type: 'DELIVERY_DONE' });
    else { setI(i + 1); setStage('intro'); }
  };

  if (stage === 'intro') return <MangaIntro key={`${i}`} item={item} reduced={reduced} onSkip={() => setStage('overview')} />;
  return (
    <div className="reveal overview" role="dialog" aria-label="New unlock" data-testid="delivery-card"
      style={{ ['--hue' as string]: item.kind === 'apple' ? apple(item.id).skin.base : '#E8A92A' }}>
      {d.collectionComplete && last && (
        <div className="complete-banner">🎉 Every apple collected! Free play is open. Keep cooking!</div>
      )}
      <div className="ov-hero">
        <div className="ov-glow" />
        <Showcase item={item} reduced={reduced} className="ov-canvas" />
        <div className="ov-tag">{item.kind === 'apple' ? 'New apple' : 'New recipe'}</div>
      </div>
      <div className="ov-body">
        {item.kind === 'apple' ? <AppleOverview id={item.id} state={state} /> : <RecipeOverview id={item.id} />}
      </div>
      <div className="ov-foot">
        {items.length > 1 && <div className="ov-dots">{items.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>}
        <button className="btn primary huge" data-testid={last ? 'delivery-done' : 'reveal-next'} onClick={next}>
          {last ? 'Back to the shop' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function MangaIntro({ item, reduced, onSkip }: { item: ShowcaseItem; reduced: boolean; onSkip: () => void }) {
  const isApple = item.kind === 'apple';
  const name = isApple ? shortName(apple(item.id).nameEn) : recipe(item.id).name;
  const ja = isApple ? apple(item.id).nameJa : recipe(item.id).nameJa;
  return (
    <div className={`reveal manga ${reduced ? 'still' : ''}`} role="dialog" aria-label={`${isApple ? 'New apple' : 'New recipe'}: ${name}`}
      data-testid="reveal-intro" onClick={onSkip}
      style={{ ['--hue' as string]: isApple ? apple(item.id).skin.base : '#E8A92A' }}>
      <div className="mg-rays" />
      <div className="mg-dots" />
      <div className="mg-slash" />
      <div className="mg-ja" lang="ja" aria-hidden>{ja}</div>
      <div className="mg-shout">
        <span className="mg-kick">{isApple ? 'NEW APPLE!' : 'NEW RECIPE!'}</span>
        <span className="mg-kick-ja" lang="ja" aria-hidden>{isApple ? '新しいりんご！' : '新メニュー！'}</span>
      </div>
      <Showcase item={item} reduced={reduced} punch className="mg-canvas" />
      <div className="mg-name">{name}</div>
      <div className="mg-skip">Tap to continue</div>
    </div>
  );
}

function AppleOverview({ id, state }: { id: string; state: GameState }) {
  const a = apple(id);
  const fits = RECIPES.map((r) => ({ r, fit: fitStars(id, r.id), open: state.progress.unlockedRecipes.includes(r.id) }))
    .filter((x) => x.fit >= 2)
    .sort((x, y) => y.fit - x.fit);
  return (
    <>
      <h2 className="ov-name">{shortName(a.nameEn)} <span className="ja" lang="ja">{a.nameJa}</span></h2>
      <p className="ov-desc">{a.overviewForKids}</p>
      <div className="ov-stats">
        {Object.entries(a.stats).map(([k, v]) => (
          <div key={k} className="ov-stat">
            <span>{STAT_LABEL[k] ?? k}</span>
            <div className="ov-pips">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= v ? 'on' : ''} />)}</div>
          </div>
        ))}
      </div>
      {fits.length > 0 && (
        <>
          <h3 className="ov-h">Great for</h3>
          <div className="ov-fits">
            {fits.map(({ r, fit, open }) => (
              <div key={r.id} className={`ov-fit ${open ? '' : 'locked'}`}>
                <img src={dishIcon(r.id)} alt="" />
                <span>{open ? r.name : '???'}</span>
                <b className={fit === 3 ? 'best' : ''}>{fit === 3 ? 'Best' : 'Good'}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function RecipeOverview({ id }: { id: string }) {
  const r = recipe(id);
  return (
    <>
      <h2 className="ov-name">{r.name} <span className="ja" lang="ja">{r.nameJa}</span></h2>
      <h3 className="ov-h">{r.steps.length} {r.steps.length === 1 ? 'action' : 'actions'}</h3>
      <ol className="ov-steps">
        {r.steps.map((s) => (
          <li key={s.id}><GestureIcon g={s.gesture} /><span>{s.label}</span></li>
        ))}
      </ol>
    </>
  );
}
