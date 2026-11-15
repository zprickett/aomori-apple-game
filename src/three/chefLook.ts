/** Apply a player's ChefLook to a cloned 'Chef' model: one hair style + eye / button / apron colours. */
import type * as THREE from 'three';
import { ALL_HAIR_NODES, EYE_COLORS, OUTFIT_COLORS, hairNode, type ChefLook } from '../core/profiles.ts';
import { plainMaterial, swapMaterial } from './assetLib.ts';

export function applyChefLook(chef: THREE.Object3D, look: ChefLook) {
  const keep = hairNode(look);
  for (const n of ALL_HAIR_NODES) {
    const o = chef.getObjectByName(n);
    if (o) o.visible = n === keep;
  }
  const outfit = OUTFIT_COLORS[look.outfit].hex;
  swapMaterial(chef, 'M_ChefIris', plainMaterial(`chef-iris-${look.eyes}`, EYE_COLORS[look.eyes].hex, true, 'M_ChefIris'));
  swapMaterial(chef, 'M_ChefButton', plainMaterial(`chef-button-${look.outfit}`, outfit, true, 'M_ChefButton'));
  swapMaterial(chef, 'M_ChefSkirt', plainMaterial(`chef-skirt-${look.outfit}`, outfit, false, 'M_ChefSkirt'));
}
