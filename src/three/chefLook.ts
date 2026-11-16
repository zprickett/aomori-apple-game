/**
 * Apply a player's ChefLook to a cloned 'Chef' model: one hair style + eye / button / apron colours,
 * plus the outfit pieces earned by rank (badge, neckerchief, beret star, gold apron).
 */
import type * as THREE from 'three';
import { ALL_HAIR_NODES, EYE_COLORS, OUTFIT_COLORS, hairNode, type ChefLook } from '../core/profiles.ts';
import { plainMaterial, swapMaterial } from './assetLib.ts';

export function applyChefLook(chef: THREE.Object3D, look: ChefLook, rank = 1) {
  const keep = hairNode(look);
  for (const n of ALL_HAIR_NODES) {
    const o = chef.getObjectByName(n);
    if (o) o.visible = n === keep;
  }
  const outfit = OUTFIT_COLORS[look.outfit].hex;
  swapMaterial(chef, 'M_ChefIris', plainMaterial(`chef-iris-${look.eyes}`, EYE_COLORS[look.eyes].hex, true, 'M_ChefIris'));
  swapMaterial(chef, 'M_ChefButton', plainMaterial(`chef-button-${look.outfit}`, outfit, true, 'M_ChefButton'));
  swapMaterial(chef, 'M_ChefSkirt', plainMaterial(`chef-skirt-${look.outfit}`, outfit, false, 'M_ChefSkirt'));
  swapMaterial(chef, 'M_ChefHat', plainMaterial(`chef-hat-${look.outfit}`, outfit, false, 'M_ChefHat'));
  for (const [node, from] of RANK_PIECES) {
    const o = chef.getObjectByName(node);
    if (o) o.visible = rank >= from;
  }
  // Golden Chef: the apron turns gold (hat, buttons and neckerchief keep the player's colour).
  const apron = chef.getObjectByName('Chef_Apron');
  if (apron && rank >= 5) swapMaterial(apron, 'M_ChefSkirt', plainMaterial('chef-skirt-gold', GOLD, true, 'M_ChefSkirt'));
}

export const GOLD = '#E8B230';

/** Chef outfit pieces and the rank that brings each one. */
export const RANK_PIECES: ReadonlyArray<readonly [string, number]> = [
  ['Chef_Badge', 2], ['Chef_Scarf', 3], ['Chef_HatStar', 4],
];
