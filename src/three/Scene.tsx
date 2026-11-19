import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { apple as appleInfo, type RecipeId } from '../core/content.ts';
import { getLib, plainMaterial, tintApple } from './assetLib.ts';
import { animateFx, appleScaleFor, makeFx, prepareProp } from './props.ts';
import { Puppet } from './puppet.ts';
import { applyChefLook } from './chefLook.ts';
import { DEFAULT_LOOK, type ChefLook } from '../core/profiles.ts';
import { COUNTER_Y, DISH_DISPLAY_SCALE, dishProp, type PropSpec, type StepStage } from '../game/stations.ts';
import { STALL_PIECES } from '../game/stallPieces.ts';
import { mixing, onCue, pointer, publishAnchors, stepClock, type AnchorMap } from '../game/bus.ts';

export type ViewMode = 'shop' | 'choose' | 'cook' | 'serve' | 'result' | 'delivery';

export interface SceneProps {
  /** The player's chef look (defaults to the original Chef Hana). */
  chefLook?: ChefLook;
  view: ViewMode;
  customerId: string;
  orderKey: string;
  props: PropSpec[];
  appleId: string | null;
  anchor: StepStage['anchor'] | null;
  tool: 'knife' | 'spoon' | null;
  toolLive: boolean;
  cue: StepStage['cue'] | null;
  chefBase: 'idle' | 'lean' | 'work';
  recipeId: RecipeId;
  /** Story rank shown on the stall and chef (upgrades and outfit pieces). */
  rank: number;
  deliveryAppleId: string | null;
  reducedMotion: boolean;
  /** A painted backdrop shows through a transparent canvas: no sky colour, fog or visible ground
   *  (the ground only catches shadows). The Canvas needs `gl={{ alpha: true }}`. */
  backdrop?: boolean;
  /** No customer yet (a news card is showing); they walk in once it closes. */
  hideCustomer?: boolean;
}

const BG = '#FCF8F0';

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

function poseFor(view: ViewMode, aspect: number): Pose {
  const fov = view === 'cook' ? 50 : 34;
  const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
  if (view === 'cook') {
    const halfW = 0.5;
    const d = halfW / tanH;
    const target = new THREE.Vector3(0.0, COUNTER_Y + 0.4, -0.04);
    const el = THREE.MathUtils.degToRad(29);
    return { pos: new THREE.Vector3(0, target.y + d * Math.sin(el), target.z + d * Math.cos(el)), look: target, fov };
  }
  const near = view === 'serve' || view === 'result' || view === 'delivery';
  const halfW = near ? 1.15 : 1.72;
  const d = halfW / tanH;
  const look = view === 'choose'
    ? new THREE.Vector3(0, -0.15, 0.4)
    : near
      ? new THREE.Vector3(0.1, 0.42, 0.6)
      : new THREE.Vector3(0, 1.12, 0.5);
  return { pos: new THREE.Vector3(0, look.y + d * 0.16, look.z + d), look, fov };
}

/** Where the cooking work spot should sit on screen (fraction of height from the top). The cook
 *  panel covers the bottom ~16% and the top bar ~7%, so the visual centre of the open area is ~0.44. */
const COOK_FOCUS_FRAC = 0.45;
const COOK_WORK_POINT = new THREE.Vector3(0, COUNTER_Y + 0.12, 0.15);

function CameraRig({ view, reduced }: { view: ViewMode; reduced: boolean }) {
  const { camera, size } = useThree();
  const cur = useRef<{ pos: THREE.Vector3; look: THREE.Vector3; shift: number } | null>(null);
  const targetCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height);
    const p = poseFor(view, aspect);
    const cam = camera as THREE.PerspectiveCamera;
    // Settled pose first (no offset) so we can measure where the work spot lands.
    targetCam.fov = p.fov; targetCam.aspect = aspect; targetCam.near = 0.1; targetCam.far = 100;
    targetCam.clearViewOffset();
    targetCam.position.copy(p.pos); targetCam.lookAt(p.look); targetCam.updateProjectionMatrix(); targetCam.updateMatrixWorld();
    let shift = 0;
    if (view === 'cook') {
      const frac = (1 - tmp.copy(COOK_WORK_POINT).project(targetCam).y) / 2;
      shift = (frac - COOK_FOCUS_FRAC) * size.height;
    }
    if (!cur.current) cur.current = { pos: p.pos.clone(), look: p.look.clone(), shift };
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    cur.current.pos.lerp(p.pos, k);
    cur.current.look.lerp(p.look, k);
    cur.current.shift += (shift - cur.current.shift) * k;
    cam.fov = p.fov; cam.aspect = aspect;
    cam.position.copy(cur.current.pos);
    cam.lookAt(cur.current.look);
    if (Math.abs(cur.current.shift) > 0.5) cam.setViewOffset(size.width, size.height, 0, cur.current.shift, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    // target camera = settled pose incl. the same vertical shift (used for stable UI anchors)
    if (shift) { targetCam.setViewOffset(size.width, size.height, 0, shift, size.width, size.height); targetCam.updateProjectionMatrix(); }
    (camera.userData as { target?: THREE.PerspectiveCamera }).target = targetCam;
  });
  return null;
}

// ---------------------------------------------------------------------------
// Stall
// ---------------------------------------------------------------------------
function Stall({ rank, reduced, view, backdrop }: { rank: number; reduced: boolean; view: ViewMode; backdrop: boolean }) {
  const lib = getLib();
  const stall = useMemo(() => lib.clone('Stall'), [lib]);
  const upgrades = useMemo(() => STALL_PIECES.filter((p) => !p.inStall).map((p) => [lib.clone(p.node), p.rank] as const), [lib]);
  // Parts of the Stall model itself that arrive with a rank (noren, lantern, chalkboard).
  const parts = useMemo(() => STALL_PIECES.filter((p) => p.inStall).map((p) => [stall.getObjectByName(p.node), p.rank] as const)
    .filter((x): x is readonly [THREE.Object3D, number] => !!x[0]), [stall]);
  // Over a painted backdrop the painting's sand is the ground: hide the model's round ground patch
  // (its stepping stones and bushes stay).
  useEffect(() => {
    const disc = stall.getObjectByName('Ground_1');
    if (disc) disc.visible = !backdrop;
  }, [stall, backdrop]);
  const sway = useMemo(() => ['Noren_L', 'Noren_C', 'Noren_R', 'Lantern'].map((n) => stall.getObjectByName(n)).filter(Boolean) as THREE.Object3D[], [stall]);
  useFrame(({ clock }) => {
    // cutaway: the noren would hide the owner's face from the overhead cooking camera
    for (const [o, at] of parts) o.visible = rank >= at && !(o.name.startsWith('Noren') && view === 'cook');
    if (reduced) return;
    const t = clock.elapsedTime;
    sway.forEach((o, i) => { o.rotation.x = 0.035 * Math.sin(t * 1.1 + i * 0.9); });
  });
  return (
    <group>
      <primitive object={stall} />
      {upgrades.map(([o, at]) => <primitive key={o.name} object={o} visible={rank >= at} />)}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Chef (shop owner)
// ---------------------------------------------------------------------------
function Chef({ base, view, reduced, look, rank }: { base: 'idle' | 'lean' | 'work'; view: ViewMode; reduced: boolean; look: ChefLook; rank: number }) {
  const lib = getLib();
  const obj = useMemo(() => lib.clone('Chef'), [lib]);
  useEffect(() => { applyChefLook(obj, look, rank); }, [obj, look, rank]);
  const puppet = useMemo(() => new Puppet(obj, 'Chef'), [obj]);
  const S = 1.18;
  useEffect(() => onCue((c) => {
    if (c.type === 'chef') puppet.play(c.anim, c.anim === 'wave' ? 1.8 : 1.3);
  }), [puppet]);
  useFrame(({ clock }) => {
    puppet.reduced = reduced;
    puppet.base = view === 'cook' ? base : 'idle';
    puppet.setRootY(view === 'cook' ? -0.22 : -0.18);
    const tx = view === 'cook' ? CHEF_COOK_X : 0;
    obj.position.x = THREE.MathUtils.lerp(obj.position.x, tx, reduced ? 1 : 0.08);
    obj.rotation.y = THREE.MathUtils.lerp(obj.rotation.y, view === 'cook' ? 0.3 : 0, reduced ? 1 : 0.08);
    puppet.update(clock.elapsedTime);
  });
  return <primitive object={obj} position={[0, -0.18, -0.36]} scale={S} />;
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
const CHEF_COOK_X = -0.44;
const CUSTOMER_SPOT = new THREE.Vector3(0.95, 0, 1.6);
function Customer({ id, orderKey, view, reduced }: { id: string; orderKey: string; view: ViewMode; reduced: boolean }) {
  const lib = getLib();
  const obj = useMemo(() => lib.clone(`Customer_${id}`), [lib, id]);
  const puppet = useMemo(() => new Puppet(obj, `Customer_${id}`), [obj, id]);
  const walk = useRef({ start: -1, from: 3.2 });
  useEffect(() => { walk.current = { start: -1, from: reduced ? CUSTOMER_SPOT.x : 3.4 }; }, [orderKey, id, reduced]);
  useEffect(() => onCue((c) => {
    if (c.type === 'customer') puppet.play(c.anim, c.anim === 'joy' ? 2.2 : 1.6);
  }), [puppet]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (walk.current.start < 0) walk.current.start = t;
    const k = Math.min(1, (t - walk.current.start) / 1.6);
    const e = 1 - Math.pow(1 - k, 2);
    obj.position.set(THREE.MathUtils.lerp(walk.current.from, CUSTOMER_SPOT.x, e), 0, CUSTOMER_SPOT.z);
    obj.rotation.y = k < 1 ? -1.25 : THREE.MathUtils.lerp(obj.rotation.y, -0.42, 0.12);
    puppet.base = k < 1 ? 'walk' : 'stand';
    puppet.reduced = reduced;
    puppet.update(t);
  });
  return <primitive object={obj} scale={1.22} visible={view !== 'cook'} />;
}

// ---------------------------------------------------------------------------
// Props (counter items) with pop-in and smooth moves
// ---------------------------------------------------------------------------
interface LiveProp { spec: PropSpec; obj: THREE.Object3D; born: number; scale: number; fx: THREE.Object3D | null }

function PropsLayer({ props, appleId, reduced, cue, recipeId }: { props: PropSpec[]; appleId: string | null; reduced: boolean; cue: SceneProps['cue']; recipeId: RecipeId }) {
  const group = useRef<THREE.Group>(null);
  const live = useRef(new Map<string, LiveProp>());
  const wobble = useRef(0);
  useEffect(() => onCue((c) => { if (c.type === 'wobble') wobble.current = performance.now() / 1000; }), []);

  // Reconcile specs → objects (only when the spec list changes).
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const now = performance.now() / 1000;
    const next = new Map<string, LiveProp>();
    for (const spec of props) {
      const sig = JSON.stringify([spec.model, spec.only, spec.hide, spec.tint, spec.fx, appleId]);
      const prev = live.current.get(spec.key);
      if (prev && prev.obj.userData.sig === sig) { prev.spec = spec; next.set(spec.key, prev); continue; }
      const obj = prepareProp(spec, appleId);
      obj.userData.sig = sig;
      const fx = makeFx(spec.fx);
      if (fx) obj.add(fx);
      const lp: LiveProp = { spec, obj, born: prev ? now - 0.05 : now, scale: (spec.scale ?? 1) * appleScaleFor(spec, appleId), fx };
      if (prev) { obj.position.copy(prev.obj.position); g.remove(prev.obj); }
      else obj.position.set(spec.x, COUNTER_Y + (spec.y ?? 0), spec.z);
      g.add(obj);
      next.set(spec.key, lp);
    }
    for (const [k, lp] of live.current) if (!next.has(k)) g.remove(lp.obj);
    live.current = next;
  }, [props, appleId]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const now = performance.now() / 1000;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 8);
    const wob = Math.max(0, 1 - (now - wobble.current) / 0.5);
    let clockMs = -1;
    if (stepClock.running) clockMs = performance.now() - stepClock.startPerf;
    for (const lp of live.current.values()) {
      const s = lp.spec;
      const target = new THREE.Vector3(s.x, COUNTER_Y + (s.y ?? 0), s.z);
      if (s.model === 'Stick') target.y += 0.1 * lp.scale;
      lp.obj.position.lerp(target, k);
      lp.obj.rotation.y = s.rotY ?? 0;
      const age = now - lp.born;
      const pop = reduced ? 1 : age < 0.35 ? 1 + 0.18 * Math.sin((age / 0.35) * Math.PI) * (age < 0.05 ? 0 : 1) : 1;
      const grow = reduced ? 1 : Math.min(1, age / 0.18);
      const sc = lp.scale * pop * Math.max(0.01, grow);
      lp.obj.scale.setScalar(sc);
      if (s.model === 'Stick') { lp.obj.scale.x *= 2.6; lp.obj.scale.z *= 2.6; }
      if (wob > 0 && !reduced) lp.obj.rotation.z = 0.08 * Math.sin(now * 40) * wob; else lp.obj.rotation.z = 0;
      if (lp.fx) animateFx(lp.fx, t, reduced);
      // diegetic cues
      if (cue === 'oven' && s.model === 'Oven') {
        const glow = lp.obj.getObjectByName('Oven_Glow') as THREE.Mesh | undefined;
        if (glow) {
          const f = clockMs < 0 ? 0.25 : Math.min(1.4, clockMs / stepClock.targetMs);
          glow.scale.setScalar(0.7 + 0.35 * Math.min(1, f));
          glow.visible = true;
        }
        const dial = lp.obj.getObjectByName('Oven_Dial');
        if (dial && clockMs >= 0) dial.rotation.z = -Math.min(1.3, clockMs / stepClock.targetMs) * Math.PI;
      }
      if (cue === 'microwave' && s.model === 'Microwave') {
        const glow = lp.obj.getObjectByName('Microwave_Glow') as THREE.Mesh | undefined;
        if (glow) {
          const f = clockMs < 0 ? 0.25 : Math.min(1.4, clockMs / stepClock.targetMs);
          glow.scale.setScalar(0.6 + 0.45 * Math.min(1, f));
          glow.visible = true;
        }
        const btn = lp.obj.getObjectByName('Microwave_Button');
        if (btn && clockMs >= 0 && !reduced) btn.scale.setScalar(1 + 0.12 * Math.max(0, Math.sin(clockMs / 120)) * Math.min(1, clockMs / stepClock.targetMs));
      }
      if (cue === 'syrup' && s.model === 'SyrupPan') {
        const syrup = lp.obj.getObjectByName('SyrupPan_Syrup') as THREE.Mesh | undefined;
        if (syrup) {
          const f = clockMs < 0 ? 0 : Math.min(1.5, clockMs / stepClock.targetMs);
          const c = new THREE.Color('#F4D27A').lerp(new THREE.Color('#C8202B'), Math.min(1, f));
          if (f > 1) c.lerp(new THREE.Color('#5A1A12'), (f - 1) * 1.6);
          syrup.material = plainMaterial(`syrup-${Math.round(f * 20)}`, `#${c.getHexString()}`, true, 'M_Candy');
        }
      }
      if (cue === 'juicer' && s.model === 'Juicer') {
        const chunks = lp.obj.getObjectByName('Juicer_Chunks');
        if (chunks && clockMs >= 0 && !reduced) chunks.rotation.y = clockMs / 600;
      }
    }
    void recipeId;
  });
  return <group ref={group} />;
}

// ---------------------------------------------------------------------------
// Hand tool (knife / spoon) follows the finger on the work plane
// ---------------------------------------------------------------------------
function Tool({ tool, live, anchor }: { tool: 'knife' | 'spoon' | null; live: boolean; anchor: StepStage['anchor'] | null }) {
  const lib = getLib();
  const knife = useMemo(() => lib.clone('Knife'), [lib]);
  const spoon = useMemo(() => lib.clone('Spoon'), [lib]);
  const { camera, size } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    knife.visible = tool === 'knife';
    spoon.visible = tool === 'spoon';
    const obj = tool === 'knife' ? knife : spoon;
    if (!tool || !anchor) return;
    const rest = tool === 'knife'
      ? new THREE.Vector3(anchor.x + 0.2, COUNTER_Y + 0.06, anchor.z + 0.16)
      : new THREE.Vector3(anchor.x + 0.3, anchor.y + 0.02, anchor.z + 0.1);
    let target = rest;
    if (live && pointer.active) {
      const cam = ((camera.userData as { target?: THREE.Camera }).target ?? camera);
      const ndc = new THREE.Vector2((pointer.x / size.width) * 2 - 1, -(pointer.y / size.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      plane.constant = -(anchor.y + (tool === 'knife' ? 0.06 : -0.02));
      if (ray.ray.intersectPlane(plane, hit)) target = hit.clone();
    }
    obj.position.lerp(target, 0.5);
    if (tool === 'knife') {
      if (live && pointer.active) obj.rotation.set(0, Math.PI / 2 + 0.2, -0.5);
      else obj.rotation.set(0, -0.5, 0);
    } else {
      obj.rotation.set(0, mixing.angle + clock.elapsedTime * 0, -0.2);
    }
    obj.scale.setScalar(1.3);
  });
  return (
    <group>
      <primitive object={knife} visible={false} />
      <primitive object={spoon} visible={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Dish display (serve / result) and delivery crate
// ---------------------------------------------------------------------------
function DishDisplay({ recipeId, appleId, visible, reduced }: { recipeId: RecipeId; appleId: string | null; visible: boolean; reduced: boolean }) {
  const obj = useMemo(() => {
    const spec = dishProp(recipeId);
    const o = prepareProp(spec, appleId);
    const s = DISH_DISPLAY_SCALE[recipeId] * appleScaleFor(spec, appleId);
    o.scale.setScalar(s);
    const fx = makeFx('sparkle');
    if (fx) { fx.scale.setScalar(1.6 / s); o.add(fx); o.userData.fx = fx; }
    return o;
  }, [recipeId, appleId]);
  const born = useRef(performance.now());
  useEffect(() => { born.current = performance.now(); }, [obj, visible]);
  useFrame(({ clock }) => {
    const age = (performance.now() - born.current) / 1000;
    obj.rotation.y = reduced ? -0.3 : -0.4 + Math.sin(clock.elapsedTime * 0.7) * 0.5;
    obj.position.set(0, COUNTER_Y + 0.02 + (reduced ? 0 : Math.max(0, 0.25 * (1 - age / 0.45))), 0.4);
    if (obj.userData.fx) animateFx(obj.userData.fx as THREE.Object3D, clock.elapsedTime, reduced);
  });
  return <primitive object={obj} visible={visible} />;
}

function DeliveryCrate({ appleId, reduced }: { appleId: string; reduced: boolean }) {
  const obj = useMemo(() => {
    const o = getLib().clone('Crate_Delivery');
    tintApple(o, appleInfo(appleId));
    return o;
  }, [appleId]);
  const born = useRef(performance.now());
  useFrame(() => {
    const age = (performance.now() - born.current) / 1000;
    const drop = reduced ? 0 : Math.max(0, 1.6 * (1 - age / 0.6));
    const squash = reduced ? 1 : age > 0.6 && age < 0.9 ? 1 - 0.12 * Math.sin(((age - 0.6) / 0.3) * Math.PI) : 1;
    obj.position.set(-0.55, drop, 1.25);
    obj.scale.set(1.5, 1.5 * squash, 1.5);
    obj.rotation.y = 0.35;
  });
  return <primitive object={obj} />;
}

// ---------------------------------------------------------------------------
// Anchors → UI (projected with the settled camera so they never jitter)
// ---------------------------------------------------------------------------
function AnchorPublisher({ anchor, view }: { anchor: StepStage['anchor'] | null; view: ViewMode }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const v2 = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const cam = (camera.userData as { target?: THREE.PerspectiveCamera }).target;
    if (!cam) return;
    const proj = (x: number, y: number, z: number, r = 0) => {
      v.set(x, y, z).project(cam);
      const sx = (v.x * 0.5 + 0.5) * size.width;
      const sy = (-v.y * 0.5 + 0.5) * size.height;
      let rp = 0;
      if (r) {
        // project a point offset along camera-right to measure radius
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        v2.set(x, y, z).addScaledVector(right, r).project(cam);
        rp = Math.abs(((v2.x * 0.5 + 0.5) * size.width) - sx);
      }
      return { x: sx, y: sy, r: rp };
    };
    const a: AnchorMap = {};
    if (view === 'cook') {
      a.work = proj(0, COUNTER_Y + 0.05, 0.2, 0.5);
      a.chefHead = proj(CHEF_COOK_X, 1.68, -0.36);
      if (anchor) a.target = proj(anchor.x, anchor.y, anchor.z, anchor.r);
    } else {
      a.customerHead = proj(CUSTOMER_SPOT.x, 1.35, CUSTOMER_SPOT.z);
      a.chefHead = proj(0, 1.95, -0.36);
      a.dish = proj(0, COUNTER_Y + 0.35, 0.4, 0.2);
      a.counter = proj(0, COUNTER_Y, 0.55);
    }
    publishAnchors(a, size.width, size.height);
  });
  return null;
}

// ---------------------------------------------------------------------------
export function GameScene(p: SceneProps) {
  const { gl, scene } = useThree();
  useEffect(() => {
    scene.background = p.backdrop ? null : new THREE.Color(BG);
    scene.fog = p.backdrop ? null : new THREE.Fog(BG, 18, 44);
    gl.toneMapping = THREE.NoToneMapping;
    if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __stepClock: stepClock });
  }, [gl, scene, p.backdrop]);
  const showDish = p.view === 'serve' || p.view === 'result' || p.view === 'delivery';
  return (
    <>
      <CameraRig view={p.view} reduced={p.reducedMotion} />
      <hemisphereLight args={['#FFF7E8', '#C9B79A', 1.55]} />
      <directionalLight
        position={[-3.5, 7, 6]} intensity={1.65} color="#FFF4E0" castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} shadow-normalBias={0.02}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-3} shadow-camera-near={1} shadow-camera-far={20}
      />
      <directionalLight position={[4, 3, 5]} intensity={0.35} color="#FFE9D6" />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        {/* Over a backdrop, only catch shadows near the stall: past the light's shadow area the
            shadow material shades the sand and draws a visible curve. */}
        <circleGeometry args={[p.backdrop ? 3.6 : 60, 32]} />
        {p.backdrop ? <shadowMaterial opacity={0.16} color="#6b4a2c" /> : <meshLambertMaterial color="#F3EBDC" />}
      </mesh>
      <Stall rank={p.rank} reduced={p.reducedMotion} view={p.view} backdrop={!!p.backdrop} />
      <Chef base={p.chefBase} view={p.view} reduced={p.reducedMotion} look={p.chefLook ?? DEFAULT_LOOK} rank={p.rank} />
      {!p.hideCustomer && <Customer id={p.customerId} orderKey={p.orderKey} view={p.view} reduced={p.reducedMotion} />}
      {p.view === 'cook' && <PropsLayer props={p.props} appleId={p.appleId} reduced={p.reducedMotion} cue={p.cue} recipeId={p.recipeId} />}
      {p.view === 'cook' && <Tool tool={p.tool} live={p.toolLive} anchor={p.anchor} />}
      {showDish && <DishDisplay recipeId={p.recipeId} appleId={p.appleId} visible reduced={p.reducedMotion} />}
      {p.view === 'delivery' && p.deliveryAppleId && <DeliveryCrate appleId={p.deliveryAppleId} reduced={p.reducedMotion} />}
      <AnchorPublisher anchor={p.anchor} view={p.view} />
    </>
  );
}
