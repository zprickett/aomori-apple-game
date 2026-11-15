/** The active player chef (name + look), shared with the UI and the 3D scene. */
import { createContext } from 'react';
import { DEFAULT_LOOK, type Profile } from '../core/profiles.ts';

export const DEFAULT_CHEF: Profile = { id: 'default', name: 'Hana', look: { ...DEFAULT_LOOK } };
export const ChefContext = createContext<Profile>(DEFAULT_CHEF);
