/**
 * Loads the Blender-authored GLB (assets/blender/build_assets.py → src/assets/models/aomori.glb),
 * converts its PBR materials to cheap flat-shaded Lambert/Phong materials shared by name, and
 * hands out clones of named root nodes. Replace the GLB (same node names) to swap art.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import glbDataUrl from '../assets/models/aomori.glb?inline';
import type { AppleInfo } from '../core/content.ts';

export interface AssetLib {
  roots: Map<string, THREE.Object3D>;
  materials: Map<string, THREE.Material>;
  clone(name: string): THREE.Object3D;
}

let libPromise: Promise<AssetLib> | null = null;
let libSync: AssetLib | null = null;

function dataUrlToBuffer(url: string): ArrayBuffer {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function toBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) return dataUrlToBuffer(url);
  const r = await fetch(url);
  return r.arrayBuffer();
}

const GLOSSY = new Set(['M_Candy', 'M_Jam', 'M_Filling', 'M_Glass', 'M_Metal', 'M_Plate']);

function convertMaterial(src: THREE.Material): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  const name = s.name || 'unnamed';
  const common = {
    name,
    color: s.color?.clone() ?? new THREE.Color('#ffffff'),
    flatShading: true,
    transparent: s.transparent || s.opacity < 1,
    opacity: s.opacity,
    side: s.side,
    depthWrite: !(s.transparent || s.opacity < 1),
  };
  let m: THREE.Material;
  if (GLOSSY.has(name)) {
    m = new THREE.MeshPhongMaterial({ ...common, shininess: name === 'M_Candy' ? 90 : 40, specular: new THREE.Color('#ffffff').multiplyScalar(name === 'M_Glass' ? 0.6 : 0.25) });
  } else {
    m = new THREE.MeshLambertMaterial(common);
  }
  const em = s.emissive;
  if (em && (em.r + em.g + em.b) > 0.01) {
    (m as THREE.MeshLambertMaterial).emissive = em.clone();
    (m as THREE.MeshLambertMaterial).emissiveIntensity = (s.emissiveIntensity ?? 1) * 0.9;
  }
  if (name === 'M_Glass') {
    (m as THREE.MeshPhongMaterial).opacity = 0.3;
  }
  return m;
}

export function loadAssets(): Promise<AssetLib> {
  if (libPromise) return libPromise;
  libPromise = (async () => {
    const buf = await toBuffer(glbDataUrl);
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => loader.parse(buf, '', res as never, rej));
    const materials = new Map<string, THREE.Material>();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const conv = (mm: THREE.Material) => {
        const key = mm.name || 'unnamed';
        let m = materials.get(key);
        if (!m) { m = convertMaterial(mm); materials.set(key, m); }
        mm.dispose();
        return m;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const roots = new Map<string, THREE.Object3D>();
    for (const child of [...gltf.scene.children]) roots.set(child.name, child);
    const lib: AssetLib = {
      roots,
      materials,
      clone(name: string) {
        const r = roots.get(name);
        if (!r) throw new Error(`Missing model node ${name}`);
        return r.clone(true);
      },
    };
    libSync = lib;
    return lib;
  })();
  return libPromise;
}

export function getLib(): AssetLib {
  if (!libSync) throw new Error('Assets not loaded');
  return libSync;
}

/** Replace a named material on every mesh in `obj` (shared material map entry → `mat`). */
export function swapMaterial(obj: THREE.Object3D, name: string, mat: THREE.Material) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => (m.name === name ? mat : m));
    else if (mesh.material.name === name) mesh.material = mat;
  });
}

export function findNode(obj: THREE.Object3D, name: string): THREE.Object3D | null {
  return obj.getObjectByName(name) ?? null;
}

// ---------------------------------------------------------------------------
// Per-variety apple materials (cached). Apple_Body has a spherical UV (v 0 top → 1 bottom).
// ---------------------------------------------------------------------------
const skinTexCache = new Map<string, THREE.Material>();
const plainCache = new Map<string, THREE.Material>();

function skinCanvas(a: AppleInfo): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  const { base, second, pattern } = a.skin;
  if (pattern === 'solid') {
    g.fillStyle = base; g.fillRect(0, 0, 128, 64);
    g.fillStyle = second; g.globalAlpha = 0.35; g.fillRect(0, 44, 128, 20); g.globalAlpha = 1;
  } else if (pattern === 'blush') {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, base); grad.addColorStop(0.55, base); grad.addColorStop(1, second);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
    // sun-side blush patches
    g.globalAlpha = 0.5; g.fillStyle = second;
    for (const x of [18, 70, 104]) { g.beginPath(); g.ellipse(x, 46, 14, 10, 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  } else {
    // streak: second colour ground with base streaks running top→bottom
    g.fillStyle = second; g.fillRect(0, 0, 128, 64);
    g.fillStyle = base;
    for (let i = 0; i < 16; i++) {
      const x = i * 8 + ((i * 37) % 5);
      const w = 4 + ((i * 13) % 4);
      g.fillRect(x, 0, w, 58 - ((i * 7) % 12));
    }
    g.globalAlpha = 0.55; g.fillRect(0, 0, 128, 26); g.globalAlpha = 1;
  }
  return c;
}

export function appleSkinMaterial(a: AppleInfo): THREE.Material {
  let m = skinTexCache.get(a.id);
  if (!m) {
    const tex = new THREE.CanvasTexture(skinCanvas(a));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    m = new THREE.MeshLambertMaterial({ name: 'M_AppleSkin', map: tex, flatShading: true });
    skinTexCache.set(a.id, m);
  }
  return m;
}

export function plainMaterial(key: string, color: string, glossy = false, name = key): THREE.Material {
  let m = plainCache.get(key);
  if (!m) {
    m = glossy
      ? new THREE.MeshPhongMaterial({ name, color: new THREE.Color(color), flatShading: true, shininess: 70, specular: new THREE.Color('#555555') })
      : new THREE.MeshLambertMaterial({ name, color: new THREE.Color(color), flatShading: true });
    plainCache.set(key, m);
  }
  return m;
}

/** Tint a cloned apple-ish object for the variety: skin (textured on Apple_Body, plain elsewhere) & flesh. */
export function tintApple(obj: THREE.Object3D, a: AppleInfo) {
  const skinTex = appleSkinMaterial(a);
  const skinPlain = plainMaterial(`skin-${a.id}`, a.skin.base, false, 'M_AppleSkin');
  const flesh = plainMaterial(`flesh-${a.id}`, a.flesh, false, 'M_Flesh');
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const hasUv = !!mesh.geometry.getAttribute('uv');
    const map = (m: THREE.Material) => (m.name === 'M_AppleSkin' ? (hasUv ? skinTex : skinPlain) : m.name === 'M_Flesh' ? flesh : m);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(map) : map(mesh.material);
  });
}

/** Jam colour: pink for red-flesh apples, golden amber otherwise, greener gold for green apples. */
export function jamColor(a: AppleInfo): string {
  if (a.fleshRed) return '#D9506A';
  if (a.id === 'a032' || a.id === 'a023') return '#D9B347';
  return '#E3A33A';
}

export function tintMaterial(obj: THREE.Object3D, name: string, key: string, color: string, glossy = true) {
  swapMaterial(obj, name, plainMaterial(key, color, glossy, name));
}
