import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { setupYjsSync } from './collab/sync';

export function Startup() {
	const world = useWorld();

	useEffect(() => {
		// Set up Yjs -> Koota sync
		const cleanup = setupYjsSync(world);

		return cleanup;
	}, [world]);

	return null;
}
