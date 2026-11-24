/**
 * The opening intro in 2.5D: the painted Aomori City backdrop stays flat (it pans with the camera,
 * see `bgRef`), while Ojiichan, his plane, the letter and the stall are the real 3D models.
 *
 * Story: the camera starts looking up into the sky above the bay. Ojiichan flies past in his
 * little plane, waves, and drops his letter. The camera tilts down after it as it flutters onto
 * the counter of the empty stall (the exact shop camera of the game), and waits to be tapped.
 *
 * The camera "tilt" is a vertical view offset of the settled shop camera, so the 3D world and the
 * painted backdrop (moved by the same number of pixels) stay locked together.
 */
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getLib } from './assetLib.ts';
import { Puppet } from './puppet.ts';
import { Stall, poseFor } from './Scene.tsx';
import { COUNTER_Y } from '../game/stations.ts';

/** Seconds from the "Let's Go!" tap. */
export const INTRO_T = Object.freeze({
  planeIn: 0.2, wave: 1.1, bubbleOut: 3.9, release: 3.3, planeOut: 6.2,
  panStart: 3.4, panEnd: 8.6, land: 8.8, logo: 9.2, ready: 10.2,
});
export type IntroPhase = 'sky' | 'bye' | 'fall' | 'landed' | 'logo' | 'ready';

/** How many screen heights above the shop view the camera looks at the start. */
const SKY_SHIFT = 1.2;
const PLANE_SCALE = 0.58;
/** Where the letter comes to rest on the counter. */
const LETTER_REST = new THREE.Vector3(-0.32, COUNTER_Y + 0.012, 0.42);
const LETTER_YAW = -0.28;
/** The letter reads at a glance on a phone: a bit bigger than life. */
const LETTER_SCALE = 1.4;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const eio = (x: number) => x * x * (3 - 2 * x);
const eo = (x: number) => 1 - (1 - x) * (1 - x);
const ei = (x: number) => x * x;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function phaseAt(t: number): IntroPhase {
  if (t >= INTRO_T.ready) return 'ready';
  if (t >= INTRO_T.logo) return 'logo';
  if (t >= INTRO_T.land) return 'landed';
  if (t >= INTRO_T.bubbleOut) return 'fall';
  if (t >= INTRO_T.wave) return 'bye';
  return 'sky';
}

/** Plane position across the sky view, as screen fractions (x from the left, y from the top). */
function planeScreen(t: number): [number, number] {
  let fx: number;
  if (t < 1.9) fx = lerp(1.5, 0.64, eo(seg(t, INTRO_T.planeIn, 1.9)));
  else if (t < 3.7) fx = lerp(0.64, 0.44, seg(t, 1.9, 3.7));
  else fx = lerp(0.44, -0.7, ei(seg(t, 3.7, INTRO_T.planeOut)));
  const fy = 0.42 + 0.012 * Math.sin(t * 2.1) - 0.08 * ei(seg(t, 3.7, INTRO_T.planeOut));
  return [fx, fy];
}

const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
/** The world point at screen fraction (fx, fy) on the plane z = `z`, seen from `cam`. */
function worldAt(cam: THREE.PerspectiveCamera, fx: number, fy: number, z: number, out: THREE.Vector3) {
  tmpV.set(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(cam);
  tmpD.copy(tmpV).sub(cam.position).normalize();
  const k = (z - cam.position.z) / tmpD.z;
  return out.copy(cam.position).addScaledVector(tmpD, k);
}

export interface IntroSceneProps {
  started: boolean;
  reduced: boolean;
  /** The letter was tapped: it leaves the counter (the 2D envelope takes over). */
  opened: boolean;
  /** Set true to jump to the letter on the counter. */
  skipRef: MutableRefObject<boolean>;
  /** The flat backdrop layer, moved by the same pixels as the camera's view offset. */
  bgRef: RefObject<HTMLDivElement | null>;
  /** 2D overlays that follow 3D points: the speech bubble (Ojiichan) and the tap hint (letter). */
  bubbleRef: RefObject<HTMLDivElement | null>;
  hintRef: RefObject<HTMLElement | null>;
  onPhase: (p: IntroPhase) => void;
  onCue: (cue: 'plane' | 'wave' | 'drop' | 'land' | 'logo') => void;
}

export function IntroScene({ started, reduced, opened, skipRef, bgRef, bubbleRef, hintRef, onPhase, onCue }: IntroSceneProps) {
  const { camera, size, gl, scene } = useThree();
  const lib = getLib();
  const { plane, prop, oji, puppet, letter } = useMemo(() => {
    const plane = lib.clone('Intro_Plane');
    const oji = lib.clone('Customer_O');
    // Ojiichan sits in the open cockpit, turned to wave at us.
    oji.position.set(0, 0.22, -0.05);
    oji.rotation.y = 0.75;
    plane.add(oji);
    plane.scale.setScalar(PLANE_SCALE);
    plane.rotation.order = 'YXZ';
    const letter = lib.clone('Intro_Letter');
    letter.traverse((o) => { o.castShadow = true; });
    return { plane, prop: plane.getObjectByName('Intro_Prop'), oji, puppet: new Puppet(oji, 'Customer_O'), letter };
  }, [lib]);
  const ring = useRef<THREE.Mesh>(null);
  // The flight always plays, even with Reduce Motion on: it's the story, the kid starts it with a tap
  // and can Skip. `reduced` only calms decoration (the ring pulse).
  const clock = useRef({ t: 0, start: -1, phase: '' as IntroPhase | '', release: new THREE.Vector3() });
  const skyCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const restCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const proj = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    scene.background = null;
  }, [gl, scene]);

  useFrame(({ clock: wall }) => {
    const c = clock.current;
    // The timeline follows the wall clock, so slow frames never stretch it.
    const prevT = c.t;
    if (started) {
      if (c.start < 0) c.start = wall.elapsedTime - c.t;
      c.t = wall.elapsedTime - c.start;
    }
    if (skipRef.current && c.t < INTRO_T.ready) { c.start -= INTRO_T.ready - c.t; c.t = INTRO_T.ready; skipRef.current = false; }
    const t = c.t;
    const dt = t - prevT;

    // Camera: the settled shop pose, offset upward into the sky, tilting down after the letter.
    const aspect = size.width / Math.max(1, size.height);
    const p = poseFor('shop', aspect);
    const cam = camera as THREE.PerspectiveCamera;
    for (const k of [cam, skyCam, restCam]) {
      k.fov = p.fov; k.aspect = aspect; k.near = 0.1; k.far = 100;
      k.position.copy(p.pos); k.lookAt(p.look);
    }
    const pan = eio(seg(t, INTRO_T.panStart, INTRO_T.panEnd));
    const shift = -SKY_SHIFT * size.height * (1 - pan);
    cam.setViewOffset(size.width, size.height, 0, shift, size.width, size.height);
    skyCam.setViewOffset(size.width, size.height, 0, -SKY_SHIFT * size.height, size.width, size.height);
    restCam.clearViewOffset();
    for (const k of [cam, skyCam, restCam]) { k.updateProjectionMatrix(); k.updateMatrixWorld(); }
    if (bgRef.current) bgRef.current.style.transform = `translate3d(0, ${(-shift).toFixed(1)}px, 0)`;

    // Plane: flies in from the right, slows to wave, drops the letter, climbs away left.
    const flying = t >= INTRO_T.planeIn && t < INTRO_T.planeOut;
    plane.visible = flying;
    if (flying) {
      const [fx, fy] = planeScreen(t);
      worldAt(skyCam, fx, fy, 0.6, plane.position);
      // We look up at it from the street, so it banks toward us: the cockpit and Ojiichan face the camera.
      plane.rotation.y = -Math.PI / 2 + 0.3;
      plane.rotation.x = -0.1 * ei(seg(t, 3.7, INTRO_T.planeOut));
      plane.rotation.z = -0.78 + 0.07 * Math.sin(t * 1.7);
      if (prop) prop.rotation.z = t * 38;
      puppet.base = 'stand';
      puppet.reduced = false;
      puppet.update(t);
    }
    // Speech bubble follows the plane.
    if (bubbleRef.current && flying) {
      oji.localToWorld(proj.set(0, 1.55, 0)).project(cam);
      bubbleRef.current.style.left = `${((proj.x + 1) / 2 * 100).toFixed(2)}%`;
      bubbleRef.current.style.top = `${((1 - proj.y) / 2 * 100).toFixed(2)}%`;
    }

    // Letter: rides in the cockpit until the drop, then flutters down like a leaf onto the counter.
    if (t < INTRO_T.release) {
      letter.visible = false;
      oji.localToWorld(c.release.set(0.25, 0.9, 0.2));
    } else {
      letter.visible = true;
      const k = seg(t, INTRO_T.release, INTRO_T.land);
      const a = c.release;
      const ph = (t - INTRO_T.release) * Math.PI * 2 * 0.5;
      const sway = 1.1 * Math.pow(1 - k, 1.3);
      pos.set(
        lerp(a.x, LETTER_REST.x, eio(k)) + sway * Math.sin(ph),
        lerp(a.y, LETTER_REST.y, k * k * (3 - 2 * k) * 0.85 + k * 0.15),
        lerp(a.z, LETTER_REST.z, eio(k)),
      );
      // Leaf flutter: it tilts into each swing, tumbles a little and spins slowly.
      // We start below it, so it falls face-tilted toward the camera, flattening out as it lands.
      let rx = lerp(1.5, 0, eio(k)) + 0.45 * Math.sin(ph * 0.5 + 0.8) * (1 - k);
      let rz = -0.7 * Math.cos(ph) * (1 - k);
      let ry = LETTER_YAW + 2.2 * (1 - eo(k)) * Math.sin(ph * 0.35);
      const since = t - INTRO_T.land;
      if (since > 0) {
        // Lands with a tiny hop and settles.
        pos.y += 0.05 * Math.exp(-since * 7) * Math.abs(Math.sin(since * 16));
        rx = 0; rz = 0; ry = LETTER_YAW;
      }
      letter.visible = !opened;
      letter.position.copy(pos);
      letter.rotation.set(rx, ry, rz);
      letter.scale.setScalar(LETTER_SCALE * (1 + 0.5 * (1 - eo(k))));
    }
    // Ready: a gold ring pulses round the letter, and the hint sits over it.
    if (ring.current) {
      const on = t >= INTRO_T.land + 0.3 && !opened;
      ring.current.visible = on;
      if (on) {
        const q = reduced ? 0.3 : ((t - INTRO_T.land) % 1.1) / 1.1;
        ring.current.position.set(LETTER_REST.x, COUNTER_Y + 0.006, LETTER_REST.z);
        ring.current.scale.setScalar(LETTER_SCALE * (1 + 0.6 * eo(q)));
        (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - q);
      }
    }
    if (hintRef.current) {
      proj.copy(LETTER_REST).project(restCam);
      hintRef.current.style.left = `${((proj.x + 1) / 2 * 100).toFixed(2)}%`;
      hintRef.current.style.top = `${((1 - proj.y) / 2 * 100).toFixed(2)}%`;
    }

    // Phases and sound cues.
    const ph = phaseAt(t);
    if (ph !== c.phase) {
      const prev = c.phase;
      c.phase = ph;
      onPhase(ph);
      if (started && prev !== '') {
        if (ph === 'bye') onCue('wave');
        if (ph === 'landed') onCue('land');
        if (ph === 'logo') onCue('logo');
      }
    }
    if (started) {
      const was = t - dt;
      if (was < INTRO_T.planeIn && t >= INTRO_T.planeIn) onCue('plane');
      if (was < INTRO_T.wave && t >= INTRO_T.wave) puppet.play('wave', 2.4);
      if (was < 2.6 && t >= 2.6) puppet.play('wave', 1.6);
      if (was < INTRO_T.release && t >= INTRO_T.release) onCue('drop');
    }
  });

  return (
    <>
      <hemisphereLight args={['#FFF7E8', '#C9B79A', 1.55]} />
      <directionalLight
        position={[-3.5, 7, 6]} intensity={1.65} color="#FFF4E0" castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} shadow-normalBias={0.02}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-3} shadow-camera-near={1} shadow-camera-far={20}
      />
      <directionalLight position={[4, 3, 5]} intensity={0.35} color="#FFE9D6" />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[3.6, 32]} />
        <shadowMaterial opacity={0.16} color="#6b4a2c" />
      </mesh>
      <Stall steps={0} reduced={reduced} view="shop" backdrop pop={null} />
      <primitive object={plane} />
      <primitive object={letter} />
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} renderOrder={2}>
        <ringGeometry args={[0.36, 0.42, 40]} />
        <meshBasicMaterial color="#F4C954" transparent depthWrite={false} />
      </mesh>
    </>
  );
}
