import { useContext } from 'react';
import { SpawnerContext } from './spawner-context';

export function useSpawner() {
	return useContext(SpawnerContext);
}
