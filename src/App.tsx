import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { selectors, type RecipeId } from './core/index.ts';
import { devPlayParams, useGame } from './game/useGame.ts';
import { recipeStages, type PropSpec } from './game/stations.ts';
import { emitCue } from './game/bus.ts';
import { loadAssets } from './three/assetLib.ts';
import { GameScene, type ViewMode } from './three/Scene.tsx';
import { CookOverlay } from './ui/CookOverlay.tsx';
import { ShopOverlay, AppleDrawer, ServeOverlay, ResultCard } from './ui/Screens.tsx';
import { UnlockReveal } from './ui/Reveal.tsx';
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
  return REVIEW ? <Review /> : <Game />;
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

function Game() {
  const { state, dispatch, persistent, reducedMotion } = useGame();
  // DEV review "Play": leaving practice returns to the review page on the same recipe.
  const devPlay = useMemo(devPlayParams, []);
  useEffect(() => {
    if (devPlay && state.mode === 'order') location.href = `/?review=recipes&recipe=${devPlay.recipeId}`;
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

  const view: ViewMode = state.phase === 'cook' ? 'cook' : state.phase;

  // Chef greets each new customer.
  useEffect(() => {
    if (state.phase === 'shop') {
      const id = window.setTimeout(() => { emitCue({ type: 'chef', anim: 'wave' }); sfx.bell(); }, reducedMotion ? 100 : 1500);
      return () => window.clearTimeout(id);
    }
  }, [state.phase, state.order.orderId, reducedMotion]);

  const appleId = state.phase === 'choose' ? state.previewAppleId : state.appleId;
  const deliveryApple = state.phase === 'delivery' ? state.delivery?.apples[0] ?? null : null;

  return (
    <div className={`frame ${reducedMotion ? 'reduced' : ''}`} data-phase={state.phase} data-sub={cook?.sub ?? ''}>
      <div className="canvas-wrap">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: 34, near: 0.1, far: 60, position: [0, 3, 12] }}
          frameloop={state.hidden ? 'never' : 'always'}
        >
          <Suspense fallback={null}>
            <GameScene
              view={view}
              customerId={state.order.customerId}
              orderKey={state.order.orderId}
              props={props}
              appleId={appleId}
              anchor={stage?.anchor ?? null}
              tool={stage?.tool ?? null}
              toolLive={cook?.sub === 'active'}
              cue={stage?.cue ?? null}
              chefBase={cook?.sub === 'bridge' ? 'work' : 'lean'}
              recipeId={recipeId}
              stallLevel={selectors.stallLevel(state)}
              deliveryAppleId={deliveryApple}
              reducedMotion={reducedMotion}
            />
          </Suspense>
        </Canvas>
      </div>

      <TopBar state={state} onOpen={setSheet} onExitPractice={() => dispatch({ type: 'EXIT_PRACTICE' })} />

      {state.phase === 'shop' && <ShopOverlay state={state} dispatch={dispatch} />}
      {state.phase === 'choose' && <AppleDrawer state={state} dispatch={dispatch} />}
      {state.phase === 'cook' && stage && (
        <CookOverlay state={state} dispatch={dispatch} stage={stage} stages={stages} bridgeFrame={bridgeFrame} setBridgeFrame={setBridgeFrame} reduced={reducedMotion} />
      )}
      {state.phase === 'serve' && <ServeOverlay state={state} dispatch={dispatch} reduced={reducedMotion} />}
      {state.phase === 'result' && <ResultCard state={state} dispatch={dispatch} reduced={reducedMotion} />}
      {state.phase === 'delivery' && <UnlockReveal key={state.order.orderId} state={state} dispatch={dispatch} reduced={reducedMotion} />}

      <Notice text={state.notice} onClose={() => dispatch({ type: 'DISMISS_NOTICE' })} />
      {!persistent && <div className="save-warn" role="status">Progress cannot be saved on this device</div>}
      {sheet && <Sheet kind={sheet} state={state} dispatch={dispatch} onClose={() => setSheet(null)} persistent={persistent} />}
    </div>
  );
}
