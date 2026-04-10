import type { Trait, World } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';

export function useWorldTraits(world: World) {
	const [traits, setTraits] = useState<Trait[]>(() => Array.from(world.traits));

	useEffect(() => {
		const handler = () => setTraits(Array.from(world.traits));
		const unsub = world.onTraitRegistered(handler);
		return unsub;
	}, [world]);

	useEffect(() => {
		const handler = () => setTraits(Array.from(world.traits));
		world[$internal].resetSubscriptions.add(handler);
		return () => {
			world[$internal].resetSubscriptions.delete(handler);
		};
	}, [world]);

	return traits;
}
