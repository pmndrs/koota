import { useContext } from 'react';
import { WorldContext } from './world-context';
import { defaultWorld } from './default-world';

export function useWorld() {
	const world = useContext(WorldContext) ?? defaultWorld;
	return world;
}
