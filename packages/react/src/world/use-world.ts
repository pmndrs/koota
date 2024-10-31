import { useContext } from 'react';
import { WorldContext } from './world-context';

export function useWorld() {
	const world = useContext(WorldContext);
	if (!world) throw new Error('Koota: Hooks can only be used within the World component!');
	return world;
}
