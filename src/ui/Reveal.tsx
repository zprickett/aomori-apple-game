import { useContext, useEffect, useState } from 'react';
import { APPLES, FIRST_NEW_APPLE, GOLDEN_RANK_CARD, LADDER, RECIPES, apple, fitStars, recipe, stepLabel, withName, type GameAction, type GameState } from '../core/index.ts';
import { emitCue } from '../game/bus.ts';
import { sfx } from '../game/audio.ts';
import { Showcase, type ShowcaseItem } from '../three/Showcase.tsx';
import { appleIcon, dishIcon, GestureIcon } from './icons.tsx';
import { RankBadge, RankUpIntro } from './Ranks.tsx';
import { NotebookReveal } from './Notebook.tsx';
import { GroupPhoto, OjiichanTasting } from './Finale.tsx';
import { stepPieceLabel, upgradeStepOf } from '../game/stallPieces.ts';
import { ChefContext } from '../game/chef.ts';

type D = (a: GameAction) => void;

const STAT_LABEL: Record<string, string> = { sweetness: 'Sweet', tartness: 'Tart', juiciness: 'Juicy', raw_firmness: 'Crunchy', aroma: 'Smell' };
const INTRO_MS = 6300;
const shortName = (n: string) => n.replace(' (Jonathan)', '');

/**
 * Unlock celebration: a manga-style entrance (speed lines, halftone, slam-in title, the new apple
 * or dish zooming in) followed by a full-screen overview card. One pass per unlocked item, except
 * that a batch of apples shares one intro ("3 NEW APPLES!") and one card (tap an apple to see it).
 */
export function UnlockReveal({ state, dispatch, reduced, onStallMoment }: { state: GameState; dispatch: D; reduced: boolean; onStallMoment?: (step: number | null) => void }) {
  const d = state.delivery!;
  // A recipe that comes with a rank is shown by its notebook page (max two pop-ups).
  // A batch of apples is one item: one intro, one card with the apples side by side.
  const items: ShowcaseItem[] = [
    ...d.apples.slice(0, 1).map((id) => ({ kind: 'apple' as const, id })),
    ...(d.rank !== null ? [] : d.recipes.map((id) => ({ kind: 'recipe' as const, id }))),
  ];
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<'intro' | 'overview' | 'journey'>('intro');
  const [pick, setPick] = useState(0);
  // The very first new apple comes alone and opens the apple journey (an extra how-it-works card).
  const firstApple = d.apples.length === 1 && d.apples[0] === FIRST_NEW_APPLE;
  /**
   * Before the unlocks: Ojiichan's tasting and the group photo, or the rank-up page and its
   * notebook page, or a "Stall upgrade!" card for a ★ step that brings no recipe.
   */
  const upgrade = upgradeStepOf(d, d.rank !== null ? LADDER.findIndex((st) => st.rank === d.rank) : null);
  const pre: Array<{ kind: 'taste' } | { kind: 'photo' } | { kind: 'rank' } | { kind: 'page' } | { kind: 'upgrade'; step: number } | { kind: 'golden'; n: number }> = [
    ...(d.goldenRank ? [{ kind: 'golden' as const, n: d.goldenRank }] : []),
    ...(d.finale ? [{ kind: 'taste' as const }, { kind: 'photo' as const }] : []),
    ...(d.rank !== null ? [{ kind: 'rank' as const }, { kind: 'page' as const }] : []),
    ...(upgrade !== undefined ? [{ kind: 'upgrade' as const, step: upgrade }] : []),
  ];
  const [preIdx, setPreIdx] = useState(0);
  const preStep = pre[preIdx] ?? null;
  const preDone = preStep === null;
  const showRank = preStep?.kind === 'rank' || preStep?.kind === 'page' ? preStep.kind : null;
  const chef = useContext(ChefContext);
  const item = items[i];
  const last = i >= items.length - 1;

  useEffect(() => {
    if (!showRank) return;
    sfx.swish();
    const t1 = window.setTimeout(() => { sfx.chop(); sfx.fanfare(); }, reduced ? 0 : 380);
    return () => window.clearTimeout(t1);
  }, [showRank, reduced]);

  useEffect(() => {
    if (!preDone || stage !== 'intro') return;
    sfx.swish();
    const t1 = window.setTimeout(() => { sfx.chop(); sfx.fanfare(); emitCue({ type: 'chef', anim: 'cheer' }); }, reduced ? 0 : 380);
    const t2 = window.setTimeout(() => setStage('overview'), reduced ? 900 : INTRO_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [stage, i, reduced, preDone]);

  const nextPre = () => {
    if (preIdx + 1 < pre.length || item) setPreIdx(preIdx + 1);
    else dispatch({ type: 'DELIVERY_DONE' });
  };
  if (preStep?.kind === 'rank') {
    return <RankUpIntro rank={d.rank!} state={state} reduced={reduced} onDone={() => { sfx.tap(); nextPre(); }} />;
  }
  if (preStep?.kind === 'page') return <NotebookReveal rank={d.rank!} state={state} name={chef.name} onDone={nextPre} />;
  if (preStep?.kind === 'taste') return <OjiichanTasting state={state} reduced={reduced} onDone={nextPre} />;
  if (preStep?.kind === 'photo') return <GroupPhoto reduced={reduced} onDone={nextPre} />;
  if (preStep?.kind === 'golden') return <GoldenRankCard n={preStep.n} name={chef.name} reduced={reduced} onDone={() => { sfx.tap(); nextPre(); }} />;
  if (preStep?.kind === 'upgrade') return <StallUpgrade step={preStep.step} reduced={reduced} onMoment={onStallMoment} onDone={() => { sfx.tap(); onStallMoment?.(null); nextPre(); }} />;
  if (!item) return null;
  const next = () => {
    sfx.tap();
    if (firstApple && item.kind === 'apple' && stage === 'overview') { setStage('journey'); return; }
    if (last) dispatch({ type: 'DELIVERY_DONE' });
    else { setI(i + 1); setStage('intro'); }
  };

  if (stage === 'intro') {
    const batch = item.kind === 'apple' && d.apples.length > 1 ? d.apples : undefined;
    return <MangaIntro key={`${i}`} item={item} batch={batch} first={firstApple && item.kind === 'apple'} reduced={reduced} onSkip={() => setStage('overview')} />;
  }
  if (stage === 'journey') return <AppleJourney found={state.progress.unlockedApples.length} last={last} onNext={next} />;
  const batch = item.kind === 'apple' && d.apples.length > 1 ? d.apples : null;
  const shown: ShowcaseItem = batch ? { kind: 'apple', id: batch[Math.min(pick, batch.length - 1)] } : item;
  return (
    <div className="reveal overview" role="dialog" aria-label="New unlock" data-testid="delivery-card"
      style={{ ['--hue' as string]: shown.kind === 'apple' ? apple(shown.id).skin.base : '#E8A92A' }}>
      {d.collectionComplete && last && (
        <div className="complete-banner">🎉 Every apple collected! Free play is open. Keep cooking!</div>
      )}
      <div className="ov-hero">
        <div className="ov-glow" />
        <Showcase item={shown} reduced={reduced} className="ov-canvas" />
        <div className="ov-tag">{batch ? `${batch.length} new apples` : item.kind === 'apple' ? 'New apple' : 'New recipe'}</div>
      </div>
      {batch && (
        <div className="ov-batch" role="tablist" aria-label="New apples">
          {batch.map((id, k) => (
            <button key={id} role="tab" aria-selected={k === pick} className={`ov-pick ${k === pick ? 'on' : ''}`} data-testid={`batch-${k}`}
              onClick={() => { sfx.tap(); setPick(k); }}>
              <img src={appleIcon(id)} alt="" /><span>{shortName(apple(id).nameEn)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ov-body">
        {shown.kind === 'apple' ? <AppleOverview key={shown.id} id={shown.id} state={state} /> : <RecipeOverview id={shown.id} />}
      </div>
      <div className="ov-foot">
        {items.length > 1 && <div className="ov-dots">{items.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>}
        <button className="btn primary huge" data-testid={last ? 'delivery-done' : 'reveal-next'} onClick={next}>
          {last && !(firstApple && item.kind === 'apple') ? 'Back to the shop' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function MangaIntro({ item, batch, first = false, reduced, onSkip }: { item: ShowcaseItem; batch?: readonly string[]; first?: boolean; reduced: boolean; onSkip: () => void }) {
  const isApple = item.kind === 'apple';
  const name = batch ? batch.map((id) => shortName(apple(id).nameEn)).join(' · ') : isApple ? shortName(apple(item.id).nameEn) : recipe(item.id).name;
  const ja = isApple ? apple(item.id).nameJa : recipe(item.id).nameJa;
  return (
    <div className={`reveal manga ${reduced ? 'still' : ''}`} role="dialog" aria-label={`${isApple ? 'New apple' : 'New recipe'}: ${name}`}
      data-testid="reveal-intro" onClick={onSkip}
      style={{ ['--hue' as string]: isApple ? apple(item.id).skin.base : '#E8A92A' }}>
      <div className="mg-rays" />
      <div className="mg-dots" />
      <div className="mg-slash" />
      {!batch && <div className="mg-ja" lang="ja" aria-hidden>{ja}</div>}
      {first ? (
        <div className="mg-shout first" data-testid="first-apple">
          <span className="mg-kick">WOW!</span>
          <span className="mg-kick long">Your first new apple!</span>
          <span className="mg-kick-ja" lang="ja" aria-hidden>はじめての新しいりんご！</span>
        </div>
      ) : (
        <div className="mg-shout">
          <span className={`mg-kick ${batch ? 'long' : ''}`}>{batch ? `${batch.length} NEW APPLES!` : isApple ? 'NEW APPLE!' : 'NEW RECIPE!'}</span>
          <span className="mg-kick-ja" lang="ja" aria-hidden>{isApple ? '新しいりんご！' : '新メニュー！'}</span>
        </div>
      )}
      <Showcase item={item} items={batch?.map((id) => ({ kind: 'apple' as const, id }))} reduced={reduced} punch className={`mg-canvas ${batch ? 'batch' : ''}`} />
      {batch ? (
        <div className="mg-batch">
          {batch.map((id, k) => (
            <div key={id} className="mg-batch-apple" style={{ animationDelay: `${0.75 + k * 0.22}s` }}>
              <span>{shortName(apple(id).nameEn)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mg-name">{name}</div>
      )}
      <div className="mg-skip">Tap to continue</div>
    </div>
  );
}

/**
 * After the very first new apple: the apple journey. Aomori's apples are there to be found, how new
 * apples arrive, why the apple matters, and where the collection is.
 */
function AppleJourney({ found, last, onNext }: { found: number; last: boolean; onNext: () => void }) {
  useEffect(() => { [0, 1, 2].forEach((k) => window.setTimeout(() => sfx.star(k), 250 + k * 160)); }, []);
  const total = APPLES.length;
  return (
    <div className="reveal overview journey" role="dialog" aria-label="Your apple journey" data-testid="apple-journey">
      <div className="aj-head">
        <span className="aj-kick">Your apple journey begins!</span>
        <span className="aj-ja" lang="ja">りんごの旅、スタート！</span>
      </div>
      <p className="aj-lead">Aomori grows lots of different apples. <b>{total} of them</b> are waiting for you to discover!</p>
      <div className="aj-progress" aria-label={`${found} of ${total} apples found`}>
        <div className="aj-bar"><i style={{ width: `${(found / total) * 100}%` }} /></div>
        <span>🍎 {found} / {total} found</span>
      </div>
      <ul className="aj-how">
        <li><span className="aj-ic" aria-hidden>🚚</span><span><b>New apples arrive as you cook.</b> Keep serving customers to find more.</span></li>
        <li><span className="aj-ic" aria-hidden>⭐</span><span><b>Each apple suits some dishes best.</b> More ★ in the apple picker means more points.</span></li>
        <li><span className="aj-ic" aria-hidden>📖</span><span><b>Tap 🍎 {found}/{total} at the top</b> to see every apple you’ve found.</span></li>
      </ul>
      <div className="ov-foot">
        <button className="btn primary huge" data-testid={last ? 'delivery-done' : 'reveal-next'} onClick={onNext}>Let’s find them all!</button>
      </div>
    </div>
  );
}

function AppleOverview({ id, state }: { id: string; state: GameState }) {
  const a = apple(id);
  const [more, setMore] = useState(false);
  const fits = RECIPES.map((r) => ({ r, fit: fitStars(id, r.id), open: state.progress.unlockedRecipes.includes(r.id) }))
    .filter((x) => x.fit >= 2)
    .sort((x, y) => y.fit - x.fit);
  // The one recipe to try it in first: the best fit the kid can already cook.
  const top = fits.find((x) => x.open && x.fit === 3) ?? fits.find((x) => x.open);
  return (
    <>
      <h2 className="ov-name">{shortName(a.nameEn)} <span className="ja" lang="ja">{a.nameJa}</span></h2>
      <p className="ov-desc">{a.overviewForKids}</p>
      {top && (
        <div className="ov-try" data-testid="ov-try">
          <img src={dishIcon(top.r.id)} alt="" />
          <span>Try it in <b>{top.r.name}</b></span>
          <b className={`ov-try-fit ${top.fit === 3 ? 'best' : ''}`}>{top.fit === 3 ? 'Best' : 'Good'}</b>
        </div>
      )}
      <button type="button" className="ov-more" aria-expanded={more} data-testid="ov-more" onClick={() => { sfx.tap(); setMore(!more); }}>
        {more ? 'Less ▴' : 'More about this apple ▾'}
      </button>
      {more && (
        <div className="ov-details">
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
        </div>
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

/**
 * Stall-upgrade moment: the scene clears to a wide shot of the whole stall, the new piece drops in
 * with a bounce, and a manga frame shouts STALL UPGRADE! (the centre stays clear to see it).
 */
/** A new Golden Chef rank (points keep counting after Golden Chef): a quick gold card. */
function GoldenRankCard({ n, name, reduced, onDone }: { n: number; name: string; reduced: boolean; onDone: () => void }) {
  useEffect(() => { if (!reduced) sfx.fanfare(); emitCue({ type: 'chef', anim: 'cheer' }); }, [reduced]);
  return (
    <div className={`golden-rank ${reduced ? 'still' : ''}`} role="dialog" aria-label={`Golden Chef rank ${n}`} data-testid="golden-rank" onClick={onDone}>
      <div className="gr-card">
        <RankBadge rank={5} size={64} />
        <div className="gr-title">{GOLDEN_RANK_CARD.title.replace('{n}', String(n))}</div>
        <div className="gr-line">{withName(GOLDEN_RANK_CARD.line, name || 'Chef')}</div>
        <div className="gr-tap">Tap to continue</div>
      </div>
    </div>
  );
}

function StallUpgrade({ step, reduced, onMoment, onDone }: { step: number; reduced: boolean; onMoment?: (s: number | null) => void; onDone: () => void }) {
  const label = stepPieceLabel(step);
  useEffect(() => {
    onMoment?.(step);
    sfx.swish();
    const t = window.setTimeout(() => { sfx.chop(); sfx.fanfare(); emitCue({ type: 'chef', anim: 'cheer' }); }, reduced ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [step, reduced, onMoment]);
  return (
    <div className={`stall-moment ${reduced ? 'still' : ''}`} role="dialog" aria-label={`Stall upgrade: ${label}`} data-testid="stall-upgrade" onClick={onDone}>
      <div className="sm-lines" aria-hidden />
      <div className="sm-top">
        <span className="sm-kick">STALL UPGRADE!</span>
        <span className="sm-kick-ja" lang="ja" aria-hidden>屋台パワーアップ！</span>
      </div>
      <div className="sm-bottom">
        <div className="sm-new">NEW</div>
        <div className="sm-name">{label}</div>
        <div className="sm-step">{stepLabel(LADDER[step])}</div>
        <div className="sm-tap">Tap to continue</div>
      </div>
    </div>
  );
}
