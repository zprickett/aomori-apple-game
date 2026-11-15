/** Prop construction and small particle effects shared by the main scene and the unlock showcase. */
import * as THREE from 'three';
import { apple as appleInfo } from '../core/content.ts';
import type { PropSpec } from '../game/stations.ts';
import { getLib, jamColor, plainMaterial, tintApple, tintMaterial } from './assetLib.ts';

export function prepareProp(spec: PropSpec, appleId: string | null): THREE.Object3D {
  const lib = getLib();
  const o = lib.clone(spec.model);
  if (spec.only) {
    const keep = new Set(spec.only);
    o.children.forEach((c) => { c.visible = keep.has(c.name); });
    // nested (e.g. Heat_Button under SyrupPan_Stove)
    o.traverse((c) => { if (c !== o && c.parent !== o && keep.has(c.name)) { c.visible = true; let p = c.parent; while (p && p !== o) { p.visible = true; p = p.parent; } } });
  }
  if (spec.hide) spec.hide.forEach((n) => { const c = o.getObjectByName(n); if (c) c.visible = false; });
  if (appleId) {
    const a = appleInfo(appleId);
    if (spec.tint === 'apple' || spec.model.startsWith('Apple') || spec.model === 'Juicer') tintApple(o, a);
    if (spec.tint === 'jam' || spec.model === 'Pot' || spec.model === 'Dish_Jam') tintMaterial(o, 'M_Jam', `jam-${a.id}`, jamColor(a), true);
    if (spec.model === 'Dish_Juice' && a.fleshRed) tintMaterial(o, 'M_JuiceGold', 'juice-pink', '#F2A0A0', false);
  }
  return o;
}

export function appleScaleFor(spec: PropSpec, appleId: string | null): number {
  if (!spec.appleSized || !appleId) return 1;
  const s = appleInfo(appleId).scale;
  return spec.model === 'Dish_CandyApple' ? s / 0.65 : s;
}

export function makeFx(kind: PropSpec['fx']): THREE.Object3D | null {
  if (!kind) return null;
  const lib = getLib();
  const g = new THREE.Group();
  if (kind === 'steam') {
    for (let i = 0; i < 3; i++) { const s = lib.clone('Steam'); s.userData.phase = i / 3; g.add(s); }
  } else if (kind === 'sparkle') {
    for (let i = 0; i < 4; i++) { const s = lib.clone('Sparkle'); s.userData.phase = i / 4; g.add(s); }
  } else if (kind === 'bubbles') {
    const mat = plainMaterial('bubble', '#FFE4A8', true);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), mat);
      m.userData.phase = i / 5; g.add(m);
    }
  }
  g.userData.kind = kind;
  return g;
}

export function animateFx(fx: THREE.Object3D, t: number, reduced: boolean) {
  const kind = fx.userData.kind as PropSpec['fx'];
  fx.children.forEach((c, i) => {
    const ph = (t * (kind === 'bubbles' ? 1.2 : 0.55) + (c.userData.phase as number)) % 1;
    if (kind === 'steam') {
      c.position.set(Math.sin(ph * 6 + i) * 0.03, 0.18 + ph * 0.25, 0);
      const s = (reduced ? 0.6 : 0.5 + ph * 0.7) * (1 - ph) * 1.4;
      c.scale.setScalar(Math.max(0.01, s));
    } else if (kind === 'sparkle') {
      const ang = i * 1.7 + t * 0.6;
      c.position.set(Math.cos(ang) * 0.12, 0.08 + 0.1 * ((i * 0.37) % 1), Math.sin(ang) * 0.08);
      const s = Math.max(0.01, Math.sin(ph * Math.PI)) * 0.9;
      c.scale.setScalar(s);
      c.rotation.z = t * 2;
    } else if (kind === 'bubbles') {
      c.position.set(Math.cos(i * 2.3) * 0.05, 0.13 * 1.3 + ph * 0.02, Math.sin(i * 2.3) * 0.05);
      c.scale.setScalar(Math.max(0.01, Math.sin(ph * Math.PI)) * 1.3);
    }
  });
}
