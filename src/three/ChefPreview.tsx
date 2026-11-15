/** Live 3D preview of the player's chef (create / edit / profile screens). */
import { useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChefLook } from '../core/profiles.ts';
import { getLib } from './assetLib.ts';
import { applyChefLook } from './chefLook.ts';
import { Puppet } from './puppet.ts';

function PreviewChef({ look, reduced, framing }: { look: ChefLook; reduced: boolean; framing: 'full' | 'bust' }) {
  const obj = useMemo(() => getLib().clone('Chef'), []);
  const puppet = useMemo(() => new Puppet(obj, 'Chef'), [obj]);
  const { camera } = useThree();
  useEffect(() => {
    applyChefLook(obj, look);
    if (!reduced) puppet.play('happy', 1.1);
  }, [obj, puppet, look, reduced]);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (framing === 'bust') { cam.position.set(0, 1.45, 2.3); cam.lookAt(0, 1.22, 0); }
    else { cam.position.set(0, 1.0, 3.6); cam.lookAt(0, 0.85, 0); }
    cam.updateProjectionMatrix();
  }, [camera, framing]);
  useFrame(({ clock }) => {
    puppet.reduced = reduced;
    puppet.base = 'idle';
    obj.rotation.y = reduced ? -0.25 : -0.25 + Math.sin(clock.elapsedTime * 0.6) * 0.35;
    puppet.update(clock.elapsedTime);
  });
  return <primitive object={obj} />;
}

export function ChefPreview({ look, reduced = false, framing = 'full', className }: { look: ChefLook; reduced?: boolean; framing?: 'full' | 'bust'; className?: string }) {
  return (
    <div className={className}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 32, position: [0, 1, 3.6] }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}>
        <hemisphereLight args={['#FFF7E8', '#C9B79A', 1.55]} />
        <directionalLight position={[-2, 4, 4]} intensity={1.6} color="#FFF4E0" />
        <directionalLight position={[3, 2, 3]} intensity={0.4} color="#FFE9D6" />
        <PreviewChef look={look} reduced={reduced} framing={framing} />
      </Canvas>
    </div>
  );
}
