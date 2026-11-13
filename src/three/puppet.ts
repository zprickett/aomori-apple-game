/** Bone-free procedural animation for the Blender characters (rotate pivoted part nodes). */
import * as THREE from 'three';

export type BasePose = 'idle' | 'lean' | 'work' | 'walk' | 'stand';
export type OneShot = 'wave' | 'cheer' | 'nod' | 'tilt' | 'serve' | 'clap' | 'happy' | 'joy' | 'think';

interface Part { node: THREE.Object3D; rest: THREE.Euler; restPos: THREE.Vector3 }

export class Puppet {
  head?: Part; armL?: Part; armR?: Part; legL?: Part; legR?: Part; eyes?: Part; body?: Part; root: THREE.Object3D;
  base: BasePose = 'idle';
  shot: OneShot | null = null;
  shotStart = 0;
  shotDur = 1.4;
  nextBlink = 2 + Math.random() * 3;
  reduced = false;
  private rootY: number;

  constructor(root: THREE.Object3D, prefix: string) {
    this.root = root;
    this.rootY = root.position.y;
    const grab = (suffix: string): Part | undefined => {
      const n = root.getObjectByName(`${prefix}_${suffix}`);
      return n ? { node: n, rest: n.rotation.clone(), restPos: n.position.clone() } : undefined;
    };
    this.head = grab('Head'); this.armL = grab('ArmL'); this.armR = grab('ArmR');
    this.legL = grab('LegL'); this.legR = grab('LegR'); this.eyes = grab('Eyes'); this.body = grab('Body');
  }

  play(shot: OneShot, dur = 1.4, now = performance.now() / 1000) {
    this.shot = shot; this.shotStart = now; this.shotDur = dur;
  }

  setRootY(y: number) { this.rootY = y; }

  update(t: number) {
    const r = this.reduced ? 0.25 : 1; // motion amplitude
    const pose = {
      headX: 0, headY: 0, headZ: 0,
      aLx: -0.12, aLz: 0.08, aRx: -0.12, aRz: -0.08,
      lLx: 0, lRx: 0, bob: 0,
    };
    const s = Math.sin;
    switch (this.base) {
      case 'idle':
      case 'stand':
        pose.headZ = 0.05 * s(t * 0.9) * r;
        pose.headY = 0.08 * s(t * 0.45) * r;
        pose.aLz += 0.03 * s(t * 1.3) * r; pose.aRz -= 0.03 * s(t * 1.3 + 1) * r;
        pose.bob = 0.008 * s(t * 2.2) * r;
        break;
      case 'lean':
        pose.headX = 0.06; pose.headZ = 0.06 * s(t * 0.8) * r;
        pose.aLx = -0.7; pose.aRx = -0.7; pose.aLz = 0.15; pose.aRz = -0.15;
        pose.bob = 0.006 * s(t * 2) * r;
        break;
      case 'work':
        pose.headX = 0.14; pose.headY = 0.1 * s(t * 0.7) * r;
        pose.aLx = -1.15; pose.aLz = 0.25;
        pose.aRx = -1.25 + 0.28 * s(t * 13) * r; pose.aRz = -0.2;
        pose.bob = 0.01 * Math.abs(s(t * 6.5)) * r;
        break;
      case 'walk': {
        const w = s(t * 9);
        pose.lLx = 0.55 * w; pose.lRx = -0.55 * w;
        pose.aLx = -0.45 * w; pose.aRx = 0.45 * w;
        pose.bob = 0.025 * Math.abs(w);
        break;
      }
    }
    if (this.shot) {
      const k = (t - this.shotStart) / this.shotDur;
      if (k >= 1) this.shot = null;
      else {
        const env = Math.sin(Math.PI * Math.min(1, k * 1.15)); // ease in/out
        const e = Math.min(1, env * 1.6);
        switch (this.shot) {
          case 'wave':
            pose.aRz = THREE.MathUtils.lerp(pose.aRz, -2.45 + 0.35 * s(t * 11) * r, e);
            pose.aRx = THREE.MathUtils.lerp(pose.aRx, -0.2, e);
            pose.headZ += 0.12 * e;
            break;
          case 'cheer':
          case 'joy':
            pose.aLz = THREE.MathUtils.lerp(pose.aLz, 2.5, e); pose.aRz = THREE.MathUtils.lerp(pose.aRz, -2.5, e);
            pose.aLx = THREE.MathUtils.lerp(pose.aLx, -0.2, e); pose.aRx = THREE.MathUtils.lerp(pose.aRx, -0.2, e);
            pose.bob += 0.07 * Math.abs(s(t * 9)) * e * r;
            break;
          case 'clap': {
            const c = 0.25 + 0.25 * s(t * 18);
            pose.aLx = THREE.MathUtils.lerp(pose.aLx, -1.3, e); pose.aRx = THREE.MathUtils.lerp(pose.aRx, -1.3, e);
            pose.aLz = THREE.MathUtils.lerp(pose.aLz, -c, e); pose.aRz = THREE.MathUtils.lerp(pose.aRz, c, e);
            pose.bob += 0.02 * Math.abs(s(t * 9)) * e * r;
            break;
          }
          case 'happy':
            pose.bob += 0.05 * Math.abs(s(t * 8)) * e * r;
            pose.headZ += 0.1 * s(t * 4) * e;
            break;
          case 'nod':
            pose.headX += 0.22 * s(t * 9) * e;
            break;
          case 'tilt':
            pose.headZ += 0.3 * e; pose.headX += 0.05 * e;
            break;
          case 'think':
            pose.headZ += 0.25 * e;
            pose.aRx = THREE.MathUtils.lerp(pose.aRx, -2.1, e); pose.aRz = THREE.MathUtils.lerp(pose.aRz, 0.5, e);
            break;
          case 'serve':
            pose.aLx = THREE.MathUtils.lerp(pose.aLx, -1.45, e); pose.aRx = THREE.MathUtils.lerp(pose.aRx, -1.45, e);
            pose.aLz = THREE.MathUtils.lerp(pose.aLz, 0.0, e); pose.aRz = THREE.MathUtils.lerp(pose.aRz, 0.0, e);
            pose.headX += 0.12 * e;
            break;
        }
      }
    }
    const set = (p: Part | undefined, x: number, y: number, z: number) => {
      if (!p) return;
      p.node.rotation.set(p.rest.x + x, p.rest.y + y, p.rest.z + z);
    };
    set(this.head, pose.headX, pose.headY, pose.headZ);
    set(this.armL, pose.aLx, 0, pose.aLz);
    set(this.armR, pose.aRx, 0, pose.aRz);
    set(this.legL, pose.lLx, 0, 0);
    set(this.legR, pose.lRx, 0, 0);
    this.root.position.y = this.rootY + pose.bob;
    // blink
    if (this.eyes) {
      if (t > this.nextBlink + 0.13) this.nextBlink = t + 2.2 + Math.random() * 3.5;
      const closing = t > this.nextBlink && t < this.nextBlink + 0.13;
      this.eyes.node.scale.y = closing ? 0.12 : 1;
    }
  }
}
