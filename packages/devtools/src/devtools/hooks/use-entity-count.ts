import type { World } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';

export function useEntityCount(world: World) {
	const [count, setCount] = useState(() => world.entities.length);

	useEffect(() => {
		const update = () => setCount(world.entities.length);
		const unsubs = [world.onEntitySpawn(update), world.onEntityDestroy(update)];
		return () => unsubs.forEach((u) => u());
	}, [world]);

	useEffect(() => {
		const handler = () => setCount(world.entities.length);
		world[$internal].resetSubscriptions.add(handler);
		return () => {
			world[$internal].resetSubscriptions.delete(handler);
		};
	}, [world]);

	return count;
}
