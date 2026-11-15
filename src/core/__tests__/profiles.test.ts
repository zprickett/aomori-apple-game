import { describe, expect, it } from 'vitest';
import { SAVE_KEY, type StorageLike } from '../persistence.ts';
import {
  DEFAULT_LOOK, MAX_PROFILES, PROFILES_KEY, cleanName, createProfileStore, hairNode, sanitizeIndex, sanitizeLook, saveKeyFor,
} from '../profiles.ts';

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const look = { sex: 'male', hair: 2, eyes: 'blue', outfit: 'purple' } as const;

describe('profiles', () => {
  it('starts empty and creates a chef that becomes active', () => {
    const st = new FakeStorage();
    const ps = createProfileStore(st);
    expect(ps.load()).toEqual({ version: 1, activeId: null, profiles: [] });
    const p = ps.create('  Ken  ', look);
    expect(p).toMatchObject({ name: 'Ken', look });
    expect(ps.load()).toMatchObject({ activeId: p.id, profiles: [p] });
    expect(JSON.parse(st.getItem(PROFILES_KEY)!).profiles).toHaveLength(1);
  });

  it('moves a pre-profile save into the first chef only', () => {
    const st = new FakeStorage();
    st.setItem(SAVE_KEY, '{"version":2,"completedOrders":9}');
    const ps = createProfileStore(st);
    const a = ps.create('Aki', DEFAULT_LOOK);
    expect(st.getItem(saveKeyFor(a.id))).toBe('{"version":2,"completedOrders":9}');
    expect(st.getItem(SAVE_KEY)).toBeNull();
    const b = ps.create('Bo', DEFAULT_LOOK);
    expect(st.getItem(saveKeyFor(b.id))).toBeNull();
  });

  it('updates name and look, removes a chef and its save', () => {
    const st = new FakeStorage();
    const ps = createProfileStore(st);
    const a = ps.create('Aki', DEFAULT_LOOK);
    st.setItem(saveKeyFor(a.id), '{}');
    expect(ps.update(a.id, { name: 'Akiko', look })).toMatchObject({ name: 'Akiko', look });
    expect(ps.update(a.id, { name: '   ' }).name).toBe('Akiko');
    ps.remove(a.id);
    expect(ps.load()).toEqual({ version: 1, activeId: null, profiles: [] });
    expect(st.getItem(saveKeyFor(a.id))).toBeNull();
  });

  it('caps the number of chefs and requires a name', () => {
    const ps = createProfileStore(new FakeStorage());
    expect(() => ps.create('   ', DEFAULT_LOOK)).toThrow();
    for (let i = 0; i < MAX_PROFILES; i++) ps.create(`Chef ${i}`, DEFAULT_LOOK);
    expect(() => ps.create('One more', DEFAULT_LOOK)).toThrow();
  });

  it('sanitises bad data', () => {
    expect(sanitizeLook({ sex: 'robot', hair: 9, eyes: 'pink', outfit: 'gold' })).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook(look)).toEqual(look);
    expect(sanitizeLook({ ...look, eyes: 'hazel' }).eyes).toBe('brown'); // retired colours fall back to brown
    const idx = sanitizeIndex({ activeId: 'zz', profiles: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }, { id: 'b', name: '' }, 5] });
    expect(idx.profiles.map((p) => p.id)).toEqual(['a']);
    expect(idx.activeId).toBeNull();
    expect(cleanName('a   very   long chef name here')).toBe('a very long ch');
    const st = new FakeStorage();
    st.setItem(PROFILES_KEY, '{not json');
    expect(createProfileStore(st).load().profiles).toEqual([]);
  });

  it('maps looks to hair meshes', () => {
    expect(hairNode(DEFAULT_LOOK)).toBe('Chef_Hair_F1');
    expect(hairNode(look)).toBe('Chef_Hair_M2');
  });
});
