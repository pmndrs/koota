import type { World } from '@koota/core';
import { createContext, useContext } from 'react';

const WorldContext = createContext<World | null>(null);

export const WorldProvider = WorldContext.Provider;

export function useWorld(): World {
	const world = useContext(WorldContext);
	if (!world) {
		throw new Error('useWorld must be used within devtools');
	}
	return world;
}

