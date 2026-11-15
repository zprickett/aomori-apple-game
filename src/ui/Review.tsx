/**
 * DEV-only review page (open http://localhost:5173/?review). Browse every apple and step through
 * every recipe stage in the real 3D scene without playing. Not reachable in production builds.
 */
import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { APPLES, RECIPES, apple, bestApplesFor, fitStars, type RecipeId } from '../core/index.ts';
import { appleUnlockAt } from '../core/progression.ts';
import { recipeStages, type PropSpec, type StepStage } from '../game/stations.ts';
import { GameScene, type ViewMode } from '../three/Scene.tsx';
import { Showcase } from '../three/Showcase.tsx';
import { appleIcon, dishIcon, GestureIcon, Stars } from './icons.tsx';

const STAT_LABEL: Record<string, string> = { sweetness: 'Sweet', tartness: 'Tart', juiciness: 'Juicy', raw_firmness: 'Crunchy', aroma: 'Smell' };

export function Review() {
  const [tab, setTab] = useState<'apples' | 'recipes'>(() => (new URLSearchParams(location.search).get('review') === 'recipes' ? 'recipes' : 'apples'));
  return (
    <div className="review">
      <header className="rv-head">
        <b>Review</b>
        <nav>
          <button className={`btn small ${tab === 'apples' ? 'on' : ''}`} onClick={() => setTab('apples')}>Apples ({APPLES.length})</button>
          <button className={`btn small ${tab === 'recipes' ? 'on' : ''}`} onClick={() => setTab('recipes')}>Recipes ({RECIPES.length})</button>
        </nav>
        <a className="rv-play" href="/">Play game →</a>
      </header>
      {tab === 'apples' ? <ApplesTab /> : <RecipesTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ApplesTab() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(APPLES[0].id);
  const list = APPLES.filter((a) => !q || `${a.nameEn} ${a.nameJa} ${a.id}`.toLowerCase().includes(q.toLowerCase()));
  const a = apple(sel);
  return (
    <div className="rv-split">
      <section className="rv-list">
        <input className="rv-search" placeholder="Search apples…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="rv-grid">
          {list.map((x) => (
            <button key={x.id} className={`rv-card ${x.id === sel ? 'sel' : ''}`} onClick={() => setSel(x.id)}>
              <img src={appleIcon(x.id)} alt="" />
              <span className={`size-chip s-${x.sizeLabel}`}>{x.sizeLabel}</span>
              <span className="nm">{x.nameEn.replace(' (Jonathan)', '')}</span>
              <span className="sub">#{appleUnlockAt(x.id)} · {x.sizeLabel} {x.weightG}g</span>
            </button>
          ))}
        </div>
      </section>
      <section className="rv-detail">
        <div className="rv-hero">
          <Showcase key={a.id} item={{ kind: 'apple', id: a.id }} reduced={false} trueSize className="rv-canvas" />
          <div className="rv-size" data-testid="review-size">
            <span className={`size-chip inline s-${a.sizeLabel}`}>{a.sizeLabel}</span>
            {a.sizeLabel === 'S' ? 'Small' : a.sizeLabel === 'M' ? 'Medium' : 'Large'} · about {a.weightG} g{a.sizeEstimated ? ' (estimate)' : ''}
          </div>
          <div className="rv-scale-note">Shown at true size (M = standard)</div>
          <img src={appleIcon(a.id)} alt="" className="rv-icon" />
        </div>
        <h2>{a.nameEn} <span className="ja" lang="ja">{a.nameJa}</span></h2>
        <p className="muted">{a.overviewForKids}</p>
        <div className="rv-facts">
          <span>Unlocks after <b>{appleUnlockAt(a.id)}</b> orders</span>
          <span>Size <b>{a.sizeLabel}</b> · about <b>{a.weightG} g</b>{a.sizeEstimated ? ' (estimate)' : ''} · 3D scale {a.scale}</span>
          {a.sizeText && <span className="muted">Source: {a.sizeText}</span>}
          <span>Flesh <b>{a.fleshRed ? 'pink/red' : 'cream'}</b></span>
          <span>Skin <i className="swatch" style={{ background: a.skin.base }} /><i className="swatch" style={{ background: a.skin.second }} /> {a.skin.pattern}</span>
        </div>
        <div className="ov-stats">
          {Object.entries(a.stats).map(([k, v]) => (
            <div key={k} className="ov-stat"><span>{STAT_LABEL[k] ?? k}</span>
              <div className="ov-pips">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= v ? 'on' : ''} style={n <= v ? { background: a.skin.base } : undefined} />)}</div>
            </div>
          ))}
        </div>
        <h3 className="ov-h">Fit by recipe</h3>
        <div className="rv-fits">
          {RECIPES.map((r) => (
            <div key={r.id} className="rv-fit"><img src={dishIcon(r.id)} alt="" /><span>{r.name}</span><Stars n={fitStars(a.id, r.id)} size={14} /></div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Frame { label: string; line: string; props: PropSpec[]; stage: StepStage | null; view: ViewMode; phase: 'bridge' | 'ready' | 'done' | 'dish' }

function framesFor(recipeId: RecipeId): Frame[] {
  const r = RECIPES.find((x) => x.id === recipeId)!;
  const stages = recipeStages(recipeId);
  const out: Frame[] = [];
  stages.forEach((st, i) => {
    const step = r.steps[i];
    const name = `Step ${i + 1}: ${step.label}`;
    st.bridge.forEach((p, k) => out.push({ label: `${name} · before ${k + 1}/${st.bridge.length}`, line: st.bridgeLines[k] ?? '', props: p, stage: st, view: 'cook', phase: 'bridge' }));
    out.push({ label: `${name} · ready (${step.gesture})`, line: st.chefLine, props: st.ready, stage: st, view: 'cook', phase: 'ready' });
    out.push({ label: `${name} · after`, line: st.praise, props: st.done, stage: st, view: 'cook', phase: 'done' });
  });
  out.push({ label: 'Finished dish', line: `Here’s your ${r.name}!`, props: [], stage: null, view: 'serve', phase: 'dish' });
  return out;
}

function RecipesTab() {
  const initial = (() => {
    const q = new URLSearchParams(location.search).get('recipe');
    return (RECIPES.find((x) => x.id === q) ?? RECIPES[RECIPES.length - 1]).id as RecipeId;
  })();
  const [rid, setRid] = useState<RecipeId>(initial);
  const [appleId, setAppleId] = useState(() => bestApplesFor(initial)[0].id);
  const [i, setI] = useState(0);
  const frames = useMemo(() => framesFor(rid), [rid]);
  const f = frames[Math.min(i, frames.length - 1)];
  const r = RECIPES.find((x) => x.id === rid)!;
  const pick = (id: RecipeId) => { setRid(id); setI(0); setAppleId(bestApplesFor(id)[0].id); };
  return (
    <div className="rv-split">
      <section className="rv-list">
        <div className="rv-recipes">
          {RECIPES.map((x) => (
            <button key={x.id} className={`rv-recipe ${x.id === rid ? 'sel' : ''}`} onClick={() => pick(x.id as RecipeId)}>
              <img src={dishIcon(x.id)} alt="" /><span>{x.name}<small>{x.steps.length} actions</small></span>
            </button>
          ))}
        </div>
        <label className="rv-apple">Apple
          <select value={appleId} onChange={(e) => setAppleId(e.target.value)}>
            {bestApplesFor(rid).map((a) => <option key={a.id} value={a.id}>{a.nameEn} ({'★'.repeat(fitStars(a.id, rid)) || '0'})</option>)}
          </select>
        </label>
        <ol className="rv-steps">
          {r.steps.map((s) => <li key={s.id}><GestureIcon g={s.gesture} /><span>{s.label}<small>{s.prompt}</small></span></li>)}
        </ol>
        <ol className="rv-frames">
          {frames.map((fr, k) => (
            <li key={k}><button className={k === i ? 'sel' : ''} onClick={() => setI(k)}>{fr.label}</button></li>
          ))}
        </ol>
      </section>
      <section className="rv-detail">
        <div className="rv-phone">
          <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 34, near: 0.1, far: 60, position: [0, 3, 12] }}>
            <Suspense fallback={null}>
              <GameScene
                view={f.view}
                customerId="A"
                orderKey="review"
                props={f.props}
                appleId={appleId}
                anchor={f.stage?.anchor ?? null}
                tool={f.phase === 'ready' ? f.stage?.tool ?? null : null}
                toolLive={false}
                cue={f.phase === 'ready' ? f.stage?.cue ?? null : null}
                chefBase={f.phase === 'bridge' ? 'work' : 'lean'}
                recipeId={rid}
                stallLevel={3}
                deliveryAppleId={null}
                reducedMotion={false}
              />
            </Suspense>
          </Canvas>
          <div className="rv-caption"><b>{f.label}</b><span>“{f.line}”</span></div>
        </div>
        <a className="btn primary huge rv-playbtn" data-testid="review-play" href={`/?play=${rid}&apple=${appleId}`}>▶ Play {r.name}</a>
        <div className="rv-nav">
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>‹ Prev</button>
          <span>{i + 1} / {frames.length}</span>
          <button className="btn primary" disabled={i >= frames.length - 1} onClick={() => setI(i + 1)}>Next ›</button>
        </div>
        <div className="rv-hero small">
          <Showcase key={`${rid}`} item={{ kind: 'recipe', id: rid }} reduced={false} className="rv-canvas" />
        </div>
      </section>
    </div>
  );
}
