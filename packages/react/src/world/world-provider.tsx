import { World } from '@koota/core';
import { WorldContext } from './world-context';

export function WorldProvider({ children, world }: { children: React.ReactNode; world: World }) {
	return <WorldContext.Provider value={world}>{children}</WorldContext.Provider>;
}
