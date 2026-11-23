import { Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { LADDER, REQUESTS, createProfileStore, requestById, saveKeyFor, selectors, type ChefLook, type Profile, type Rank, type RecipeId } from './core/index.ts';
import { ChefContext, DEFAULT_CHEF } from './game/chef.ts';
import { ChefMaker, Welcome, WhoIsCooking } from './ui/Onboarding.tsx';
import { GrandpaLetter, NewsCard } from './ui/Notebook.tsx';
import { Intro } from './ui/Intro.tsx';
import { devPlayParams, useGame } from './game/useGame.ts';
import { recipeStages, type PropSpec } from './game/stations.ts';
import { emitCue } from './game/bus.ts';
import { loadAssets } from './three/assetLib.ts';
import { GameScene, type ViewMode } from './three/Scene.tsx';
import { CookOverlay } from './ui/CookOverlay.tsx';
import { ShopOverlay, AppleDrawer, ServeOverlay, ResultCard } from './ui/Screens.tsx';
import { UnlockReveal } from './ui/Reveal.tsx';
import { DayRecap } from './ui/Ranks.tsx';
import { MenuStrip, RequestLetterButton, RequestScreen, Stage2Intro } from './ui/Requests.tsx';
import { backdropFit, backgroundFor } from './game/backgrounds.ts';
import { upgradeStepOf } from './game/stallPieces.ts';
import { Review } from './ui/Review.tsx';
import { TopBar, Sheet, Notice, type SheetKind } from './ui/Chrome.tsx';
import { sfx } from './game/audio.ts';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function App() {
  const [assets, setAssets] = useState<'loading' | 'ready' | 'error'>('loading');
  const [gl] = useState(webglAvailable);
  useEffect(() => {
    if (!gl) return;
    loadAssets().then(() => setAssets('ready'), (e) => { console.error(e); setAssets('error'); });
  }, [gl]);

  if (!gl) return <Fallback title="3D isn’t available here" body="Aomori Apple Kitchen needs WebGL. Try another browser, or turn on hardware acceleration." />;
  if (assets === 'error') return <Fallback title="The stall couldn’t be set up" body="Something went wrong loading the 3D models. Please reload the page." />;
  if (assets === 'loading') return <Fallback title="Opening the apple stall…" body="" loading />;
  if (REVIEW) return <Review />;
  if (devPlayParams()) return <Game />;
  return <Root />;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

type Screen = 'intro' | 'welcome' | 'create' | 'letter' | 'who' | 'play' | 'edit';

/** The opening intro plays once per device (Settings → Watch the intro replays it). `?intro` forces it. */
const INTRO_KEY = 'aomori-intro-seen';
const FORCE_INTRO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('intro');
function introSeen(storage: Storage | null): boolean {
  try { return storage?.getItem(INTRO_KEY) === '1'; } catch { return false; }
}
function markIntroSeen(storage: Storage | null) {
  try { storage?.setItem(INTRO_KEY, '1'); } catch { /* private mode: it just plays again next time */ }
}

/** Onboarding + profiles around the game. Each chef has their own save.
 *  First visit: intro (ending on Ojiichan's letter to the family, opened from the stall) → make your chef → the stall. */
function Root() {
  const storage = useMemo(safeStorage, []);
  const store = useMemo(() => createProfileStore(storage), [storage]);
  const [idx, setIdx] = useState(() => store.load());
  const [screen, setScreen] = useState<Screen>(() => (FORCE_INTRO || (!idx.profiles.length && !introSeen(storage)) ? 'intro'
    : idx.profiles.length ? 'who' : 'welcome'));
  const [chef, setChef] = useState<Profile | null>(null);
  // The family letter was read before the chef maker, so the new chef goes straight to the stall.
  const [letterRead, setLetterRead] = useState(false);
  const [replay, setReplay] = useState(false);
  const refresh = () => setIdx(store.load());
  const play = (p: Profile) => { store.setActive(p.id); refresh(); setChef(p); setScreen('play'); };

  if (screen === 'intro') {
    const fresh = !idx.profiles.length;
    return <Intro doneLabel={fresh ? 'Make your chef' : 'Let’s go!'}
      onDone={() => { markIntroSeen(storage); setLetterRead(fresh); setScreen(fresh ? 'create' : 'who'); }} />;
  }
  if (screen === 'play' && chef) {
    return (
      <ChefContext.Provider value={chef}>
        <Game key={chef.id} saveKey={saveKeyFor(chef.id)} onSwitchChef={() => { refresh(); setScreen('who'); }} onEditChef={() => setScreen('edit')}
          onWatchIntro={() => setReplay(true)} />
        {replay && <div className="intro-overlay"><Intro replay doneLabel="Back to my stall" onDone={() => setReplay(false)} /></div>}
      </ChefContext.Provider>
    );
  }
  let body;
  if (screen === 'welcome') body = <Welcome onStart={() => setScreen('create')} />;
  else if (screen === 'create') {
    // A new chef reads Ojiichan's letter before the first order (unless it was just read after the intro).
    body = <ChefMaker mode="create" onBack={idx.profiles.length || !letterRead ? () => setScreen(idx.profiles.length ? 'who' : 'welcome') : undefined}
      onDone={(name: string, look: ChefLook) => { const p = store.create(name, look); refresh(); setChef(p); if (letterRead) play(p); else setScreen('letter'); }} />;
  } else if (screen === 'letter' && chef) {
    body = <GrandpaLetter name={chef.name} onDone={() => play(chef)} />;
  } else if (screen === 'edit' && chef) {
    body = <ChefMaker mode="edit" initial={chef} onBack={() => setScreen('play')}
      onDone={(name: string, look: ChefLook) => { const p = store.update(chef.id, { name, look }); refresh(); setChef(p); setScreen('play'); }} />;
  } else {
    body = <WhoIsCooking profiles={idx.profiles} activeId={idx.activeId}
      onPlay={(id) => { const p = idx.profiles.find((x) => x.id === id); if (p) play(p); }}
      onNew={() => { setLetterRead(false); setScreen('create'); }}
      onDelete={(id) => { store.remove(id); const next = store.load(); setIdx(next); if (!next.profiles.length) setScreen('welcome'); }} />;
  }
  return <div className="frame onb-frame">{body}</div>;
}

/** DEV only: http://localhost:5173/?review opens the apple / recipe review page. */
const REVIEW = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('review');

function Fallback({ title, body, loading }: { title: string; body: string; loading?: boolean }) {
  return (
    <div className="frame fallback" role="alert">
      <div className="fallback-card">
        <div className={`fallback-apple ${loading ? 'spin' : ''}`} aria-hidden>🍎</div>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
    </div>
  );
}

function Game({ saveKey, onSwitchChef, onEditChef, onWatchIntro }: { saveKey?: string; onSwitchChef?: () => void; onEditChef?: () => void; onWatchIntro?: () => void }) {
  const { state, dispatch, persistent, reducedMotion } = useGame(saveKey);
  const chef = useContext(ChefContext) ?? DEFAULT_CHEF;
  // `?play=`: leaving practice returns to the review page on the same recipe (dev).
  const devPlay = useMemo(devPlayParams, []);
  useEffect(() => {
    // (Outside dev there is no review page: start the same practice again.)
    if (devPlay && state.mode === 'order') location.href = import.meta.env.DEV ? `/?review=recipes&recipe=${devPlay.recipeId}` : `${location.pathname}${location.search}`;
  }, [devPlay, state.mode]);
  const [sheet, setSheet] = useState<null | SheetKind>(null);
  const [bridgeFrame, setBridgeFrame] = useState(0);

  const recipe = selectors.activeRecipe(state);
  const recipeId = recipe.id as RecipeId;
  const stages = useMemo(() => recipeStages(recipeId), [recipeId]);
  const cook = state.cook;
  const stage = state.phase === 'cook' && cook ? stages[cook.stepIndex] : null;

  // Which food state is on the counter right now.
  const props: PropSpec[] = useMemo(() => {
    if (state.phase !== 'cook' || !cook || !stage) return [];
    if (cook.sub === 'bridge') return stage.bridge[Math.min(bridgeFrame, stage.bridge.length - 1)] ?? stage.ready;
    if (cook.sub === 'feedback') return stage.done;
    return stage.ready;
  }, [state.phase, cook, stage, bridgeFrame]);

  /** The stall-upgrade moment playing in the reveal: its ladder step, or null. */
  const [stallMoment, setStallMoment] = useState<number | null>(null);
  useEffect(() => { if (state.phase !== 'delivery') setStallMoment(null); }, [state.phase]);
  const run = state.request;
  const req = run ? requestById(run.id) : null;
  // A request's gift drops onto the shelf on its first rewards screen (wide 'upgrade' shot).
  const giftMoment = run?.view === 'rewards' && run.first ? req!.gift.node : null;
  const view: ViewMode = stallMoment !== null || giftMoment ? 'upgrade'
    : state.phase === 'day' ? 'result'
    : state.phase === 'request' ? (run && (run.view === 'reveal' || run.view === 'rewards') ? 'result' : 'shop')
    : state.phase;
  const gifts = REQUESTS.filter((r) => state.progress.requests[r.id]?.done || r.gift.node === giftMoment).map((r) => r.gift.node);

  // Chef greets each new customer.
  useEffect(() => {
    if (state.phase === 'shop') {
      const id = window.setTimeout(() => { emitCue({ type: 'chef', anim: 'wave' }); sfx.bell(); }, reducedMotion ? 100 : 1500);
      return () => window.clearTimeout(id);
    }
  }, [state.phase, state.order.orderId, reducedMotion]);

  // The stall moves and upgrades after the rank-up and its notebook page have been shown.
  const pendingRank = (state.phase === 'result' || state.phase === 'delivery') ? state.delivery?.rank ?? null : null;
  const shownRank: Rank = pendingRank ? (pendingRank - 1) as Rank : selectors.rank(state);
  // A piece shown off by the stall-upgrade moment stays hidden until that moment drops it in.
  const showOff = (state.phase === 'result' || state.phase === 'delivery') && state.delivery
    ? upgradeStepOf(state.delivery, pendingRank ? LADDER.findIndex((st) => st.rank === pendingRank) : null) : undefined;
  const shownSteps = stallMoment !== null ? stallMoment + 1
    : showOff !== undefined ? showOff
    : pendingRank ? LADDER.findIndex((st) => st.rank === pendingRank) : selectors.steps(state);
  const backdrop = backgroundFor(shownRank);
  const news = selectors.pendingNews(state);
  const stage2 = selectors.pendingStage2(state);
  const letter = news || stage2 ? null : selectors.waitingRequest(state);
  const appleId = state.phase === 'choose' ? state.previewAppleId : state.appleId;
  const deliveryApple = state.phase === 'delivery' ? state.delivery?.apples[0] ?? null : null;

  return (
    <div className={`frame ${reducedMotion ? 'reduced' : ''}`} data-phase={state.phase} data-sub={cook?.sub ?? ''}>
      <div className={`scene-bg view-${view}`} aria-hidden style={{
        backgroundImage: `url(${backdrop.url})`, top: `${backdropFit(backdrop).top * 100}%`, height: `${backdropFit(backdrop).height * 100}%`,
      }} />
      <div className="canvas-wrap">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          camera={{ fov: 34, near: 0.1, far: 60, position: [0, 3, 12] }}
          frameloop={state.hidden ? 'never' : 'always'}
        >
          <Suspense fallback={null}>
            <GameScene
              chefLook={chef.look}
              view={view}
              customerId={req ? req.customer : state.order.customerId}
              orderKey={run ? `request-${run.id}` : state.order.orderId}
              props={props}
              appleId={appleId}
              anchor={stage?.anchor ?? null}
              tool={stage?.tool ?? null}
              toolLive={cook?.sub === 'active'}
              cue={stage?.cue ?? null}
              chefBase={cook?.sub === 'bridge' ? 'work' : 'lean'}
              recipeId={recipeId}
              rank={shownRank}
              steps={shownSteps}
              deliveryAppleId={deliveryApple}
              reducedMotion={reducedMotion}
              backdrop
              hideCustomer={news !== null || stage2 || stallMoment !== null || giftMoment !== null}
              sideCustomerId={state.mode === 'order' && stallMoment === null ? selectors.sideCustomer(state) : null}
              helper={selectors.ojiichanHelps(state) && stallMoment === null}
              popStep={stallMoment}
              gifts={gifts}
              popGift={giftMoment}
            />
          </Suspense>
        </Canvas>
      </div>

      <TopBar state={state} onOpen={setSheet} onExitPractice={() => dispatch({ type: 'EXIT_PRACTICE' })} />

      {state.phase === 'shop' && (news
        ? <NewsCard item={news} name={chef.name} first={!state.progress.seenUnlockRewards.some((k) => k.startsWith('news:'))} onDone={() => dispatch({ type: 'NEWS_SEEN', rank: news.rank })} />
        : stage2
          ? <Stage2Intro name={chef.name} reduced={reducedMotion} onDone={() => { dispatch({ type: 'STAGE2_SEEN' }); dispatch({ type: 'OPEN_REQUEST', id: REQUESTS[0].id }); }} />
          : <ShopOverlay state={state} dispatch={dispatch} />)}
      {state.phase === 'shop' && letter && <RequestLetterButton req={letter} onOpen={() => dispatch({ type: 'OPEN_REQUEST', id: letter.id })} />}
      {state.phase === 'request' && <RequestScreen state={state} dispatch={dispatch} name={chef.name} reduced={reducedMotion} />}
      {state.mode === 'request' && (state.phase === 'cook' || state.phase === 'serve') && <MenuStrip state={state} />}
      {state.phase === 'choose' && <AppleDrawer state={state} dispatch={dispatch} />}
      {state.phase === 'cook' && stage && (
        <CookOverlay state={state} dispatch={dispatch} stage={stage} stages={stages} bridgeFrame={bridgeFrame} setBridgeFrame={setBridgeFrame} reduced={reducedMotion} />
      )}
      {state.phase === 'serve' && <ServeOverlay state={state} dispatch={dispatch} reduced={reducedMotion} />}
      {state.phase === 'result' && <ResultCard state={state} dispatch={dispatch} reduced={reducedMotion} />}
      {state.phase === 'day' && <DayRecap state={state} dispatch={dispatch} reduced={reducedMotion} />}
      {state.phase === 'delivery' && <UnlockReveal key={state.order.orderId} state={state} dispatch={dispatch} reduced={reducedMotion} onStallMoment={setStallMoment} />}

      <Notice text={state.notice} onClose={() => dispatch({ type: 'DISMISS_NOTICE' })} />
      {!persistent && <div className="save-warn" role="status">Progress cannot be saved on this device</div>}
      {sheet && <Sheet kind={sheet} state={state} dispatch={dispatch} onClose={() => setSheet(null)} persistent={persistent}
        chefName={chef.name} onSwitchChef={onSwitchChef} onEditChef={onEditChef} onWatchIntro={onWatchIntro} />}
    </div>
  );
}
