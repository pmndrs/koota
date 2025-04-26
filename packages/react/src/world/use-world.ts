import { useContext } from 'react';
import { WorldContext } from './world-context';

export function useWorld() {
	const world = useContext(WorldContext);

	if (!world) {
		throw new Error('Koota: useWorld must be used within a WorldProvider');
	}

	return world;
}
