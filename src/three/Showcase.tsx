import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { apple, bestApplesFor, type RecipeId } from '../core/content.ts';
import { dishProp, type PropSpec } from '../game/stations.ts';
import { animateFx, makeFx, prepareProp } from './props.ts';

export type ShowcaseItem = { kind: 'apple'; id: string } | { kind: 'recipe'; id: string };

/** Spinning hero model of a new apple or dish, sized to fit its own little canvas. */
function Hero({ item, reduced, punch, trueSize }: { item: ShowcaseItem; reduced: boolean; punch: boolean; trueSize: boolean }) {
  const { obj, base } = useMemo(() => {
    let spec: PropSpec;
    let appleId: string;
    if (item.kind === 'apple') {
      spec = { key: 'hero', model: 'Apple', x: 0, z: 0, tint: 'apple' };
      appleId = item.id;
    } else {
      spec = dishProp(item.id as RecipeId);
      appleId = bestApplesFor(item.id)[0]?.id ?? 'a048';
    }
    const o = prepareProp(spec, appleId);
    // Normalise size: fit the model's bounding box into ~1 unit, centred on its middle.
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    // trueSize (apples): keep the variety's relative 3D size, where 1.0 = a standard M apple.
    const sizeK = trueSize && item.kind === 'apple' ? apple(item.id).scale : 1;
    const s = (1 / Math.max(size.x, size.y, size.z)) * (item.kind === 'apple' ? (trueSize ? 0.6 : 0.72) : 0.85) * sizeK;
    const g = new THREE.Group();
    o.position.sub(centre);
    g.add(o);
    const fx = makeFx('sparkle');
    if (fx) { fx.scale.setScalar(0.65); fx.position.y = -0.02; g.add(fx); g.userData.fx = fx; }
    return { obj: g, base: s };
  }, [item, trueSize]);
  const born = useRef(performance.now());
  useFrame(({ clock }) => {
    const age = (performance.now() - born.current) / 1000;
    // Manga entrance: zoom from tiny with an overshoot, then a slow turntable spin + bob.
    const k = reduced || !punch ? 1 : age < 0.5 ? 1.25 * (1 - Math.pow(1 - age / 0.5, 3)) : 1 + 0.25 * Math.exp(-(age - 0.5) * 7) * Math.cos((age - 0.5) * 18);
    obj.scale.setScalar(base * Math.max(0.01, k));
    obj.rotation.y = reduced ? 0.5 : clock.elapsedTime * 0.9;
    obj.rotation.x = reduced ? 0.15 : 0.15 + Math.sin(clock.elapsedTime * 1.3) * 0.06;
    obj.position.y = reduced ? 0 : Math.sin(clock.elapsedTime * 1.6) * 0.04;
    if (obj.userData.fx) animateFx(obj.userData.fx as THREE.Object3D, clock.elapsedTime, reduced);
  });
  return <primitive object={obj} />;
}

export function Showcase({ item, reduced, punch = false, trueSize = false, className }: {
  item: ShowcaseItem; reduced: boolean; punch?: boolean; trueSize?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 30, position: [0, 0.35, 2.6] }}
        onCreated={({ gl, camera }) => { gl.toneMapping = THREE.NoToneMapping; camera.lookAt(0, 0, 0); }}>
        <hemisphereLight args={['#FFF7E8', '#C9B79A', 1.6]} />
        <directionalLight position={[-2, 3, 3]} intensity={1.6} color="#FFF4E0" />
        <directionalLight position={[2.5, 1, 2]} intensity={0.5} color="#FFE9D6" />
        <Hero key={`${item.kind}:${item.id}`} item={item} reduced={reduced} punch={punch} trueSize={trueSize} />
      </Canvas>
    </div>
  );
}
