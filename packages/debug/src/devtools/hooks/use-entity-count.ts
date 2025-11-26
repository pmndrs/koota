import type { World } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';

export function useEntityCount(world: World) {
	const [count, setCount] = useState(() => world.entities.length);

	// Subscribe to entity spawned/destroyed
	useEffect(() => {
		const update = () => setCount(world.entities.length);

		world[$internal].entitySpawnedSubscriptions.add(update);
		world[$internal].entityDestroyedSubscriptions.add(update);

		return () => {
			world[$internal].entitySpawnedSubscriptions.delete(update);
			world[$internal].entityDestroyedSubscriptions.delete(update);
		};
	}, [world]);

	// Handle world reset
	useEffect(() => {
		const handler = () => setCount(world.entities.length);
		world[$internal].resetSubscriptions.add(handler);
		return () => {
			world[$internal].resetSubscriptions.delete(handler);
		};
	}, [world]);

	return count;
}
