/**
 * Player profiles: each chef has a name, a look and their own save slot.
 *
 *   localStorage 'aomori-profiles'             → { version: 1, activeId, profiles: Profile[] }
 *   localStorage 'aomori-kitchen-save:<id>'     → that chef's SaveData (see persistence.ts)
 *
 * A save written before profiles existed ('aomori-kitchen-save') is moved into the first chef
 * created on that device, so existing progress is kept.
 */
import { SAVE_KEY, type StorageLike } from './persistence.ts';

export const PROFILES_KEY = 'aomori-profiles';
export const MAX_PROFILES = 6;
export const NAME_MAX = 14;

export type ChefSex = 'female' | 'male';
export type HairStyle = 1 | 2 | 3;
export type EyeColor = 'brown' | 'dark' | 'blue' | 'green' | 'hazel';
export type OutfitColor = 'red' | 'pink' | 'lightblue' | 'purple';

export interface ChefLook {
  sex: ChefSex;
  hair: HairStyle;
  eyes: EyeColor;
  outfit: OutfitColor;
}

export interface Profile {
  id: string;
  name: string;
  look: ChefLook;
}

export interface ProfileIndex {
  version: 1;
  activeId: string | null;
  profiles: Profile[];
}

export const EYE_COLORS: Readonly<Record<EyeColor, { label: string; hex: string }>> = Object.freeze({
  brown: { label: 'Brown', hex: '#6B3E26' },
  dark: { label: 'Dark brown', hex: '#3A2418' },
  hazel: { label: 'Hazel', hex: '#8A6A2E' },
  green: { label: 'Green', hex: '#3F7A45' },
  blue: { label: 'Blue', hex: '#3A6FB0' },
});

export const OUTFIT_COLORS: Readonly<Record<OutfitColor, { label: string; hex: string }>> = Object.freeze({
  red: { label: 'Red', hex: '#D94232' },
  pink: { label: 'Pink', hex: '#EE7FA6' },
  lightblue: { label: 'Light blue', hex: '#7FBDE8' },
  purple: { label: 'Purple', hex: '#8E5BB8' },
});

export const HAIR_NAMES: Readonly<Record<ChefSex, readonly [string, string, string]>> = Object.freeze({
  female: ['Ponytail', 'Long', 'Buns'],
  male: ['Short', 'Spiky', 'Swept'],
});

/** Mesh name for a look's hair style in the GLB, e.g. 'Chef_Hair_F2'. */
export function hairNode(look: Pick<ChefLook, 'sex' | 'hair'>): string {
  return `Chef_Hair_${look.sex === 'female' ? 'F' : 'M'}${look.hair}`;
}
export const ALL_HAIR_NODES = ['F1', 'F2', 'F3', 'M1', 'M2', 'M3'].map((s) => `Chef_Hair_${s}`);

/** The original stall chef (Chef Hana): ponytail, brown eyes, red outfit. */
export const DEFAULT_LOOK: Readonly<ChefLook> = Object.freeze({ sex: 'female', hair: 1, eyes: 'brown', outfit: 'red' });

export function saveKeyFor(profileId: string): string {
  return `${SAVE_KEY}:${profileId}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trim, collapse spaces, cap length. Empty → ''. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function sanitizeLook(v: unknown): ChefLook {
  const o = isObj(v) ? v : {};
  return {
    sex: o.sex === 'male' ? 'male' : 'female',
    hair: o.hair === 2 || o.hair === 3 ? o.hair : 1,
    eyes: typeof o.eyes === 'string' && o.eyes in EYE_COLORS ? (o.eyes as EyeColor) : DEFAULT_LOOK.eyes,
    outfit: typeof o.outfit === 'string' && o.outfit in OUTFIT_COLORS ? (o.outfit as OutfitColor) : DEFAULT_LOOK.outfit,
  };
}

export function sanitizeIndex(v: unknown): ProfileIndex {
  const o = isObj(v) ? v : {};
  const seen = new Set<string>();
  const profiles: Profile[] = [];
  for (const p of Array.isArray(o.profiles) ? o.profiles : []) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    const name = cleanName(typeof p.name === 'string' ? p.name : '');
    if (!name) continue;
    seen.add(p.id);
    profiles.push({ id: p.id, name, look: sanitizeLook(p.look) });
    if (profiles.length >= MAX_PROFILES) break;
  }
  const activeId = typeof o.activeId === 'string' && seen.has(o.activeId) ? o.activeId : null;
  return { version: 1, activeId, profiles };
}

export interface ProfileStore {
  load(): ProfileIndex;
  /** Create a chef (moves a pre-profile save into it the first time). Throws if full or name empty. */
  create(name: string, look: ChefLook): Profile;
  update(id: string, patch: { name?: string; look?: ChefLook }): Profile;
  remove(id: string): void;
  setActive(id: string | null): void;
}

function newId(existing: readonly string[]): string {
  for (let i = 0; i < 1000; i++) {
    const id = `p${Math.random().toString(36).slice(2, 8)}`;
    if (!existing.includes(id)) return id;
  }
  return `p${existing.length + 1}`;
}

/** Profile index in storage (null storage → memory only). */
export function createProfileStore(storage: StorageLike | null): ProfileStore {
  let memory: ProfileIndex = { version: 1, activeId: null, profiles: [] };
  const read = (): ProfileIndex => {
    if (!storage) return memory;
    try {
      const t = storage.getItem(PROFILES_KEY);
      return t ? sanitizeIndex(JSON.parse(t)) : memory;
    } catch {
      return memory;
    }
  };
  const write = (idx: ProfileIndex) => {
    memory = idx;
    try { storage?.setItem(PROFILES_KEY, JSON.stringify(idx)); } catch { /* memory only */ }
  };
  return {
    load: read,
    create(name, look) {
      const idx = read();
      const n = cleanName(name);
      if (!n) throw new Error('Name required');
      if (idx.profiles.length >= MAX_PROFILES) throw new Error('Too many chefs');
      const p: Profile = { id: newId(idx.profiles.map((x) => x.id)), name: n, look: sanitizeLook(look) };
      if (idx.profiles.length === 0 && storage) {
        try {
          const legacy = storage.getItem(SAVE_KEY);
          if (legacy !== null) {
            storage.setItem(saveKeyFor(p.id), legacy);
            storage.removeItem(SAVE_KEY);
          }
        } catch { /* keep going without migration */ }
      }
      write({ version: 1, activeId: p.id, profiles: [...idx.profiles, p] });
      return p;
    },
    update(id, patch) {
      const idx = read();
      const cur = idx.profiles.find((x) => x.id === id);
      if (!cur) throw new Error('Unknown chef');
      const next: Profile = {
        ...cur,
        name: patch.name !== undefined ? cleanName(patch.name) || cur.name : cur.name,
        look: patch.look ? sanitizeLook(patch.look) : cur.look,
      };
      write({ ...idx, profiles: idx.profiles.map((x) => (x.id === id ? next : x)) });
      return next;
    },
    remove(id) {
      const idx = read();
      try { storage?.removeItem(saveKeyFor(id)); } catch { /* ignore */ }
      write({ ...idx, activeId: idx.activeId === id ? null : idx.activeId, profiles: idx.profiles.filter((x) => x.id !== id) });
    },
    setActive(id) {
      const idx = read();
      write({ ...idx, activeId: id && idx.profiles.some((x) => x.id === id) ? id : null });
    },
  };
}
