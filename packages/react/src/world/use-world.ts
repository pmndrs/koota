import { useContext } from 'react';
import { WorldContext } from './world-context';

export function useWorld() {
	return useContext(WorldContext);
}
