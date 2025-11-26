import type { Trait, World } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';

export function useWorldTraits(world: World) {
	const [traits, setTraits] = useState<Trait[]>(() => Array.from(world.traits));

	// Subscribe to trait registrations
	useEffect(() => {
		const handler = () => setTraits(Array.from(world.traits));
		world[$internal].traitRegisteredSubscriptions.add(handler);
		return () => {
			world[$internal].traitRegisteredSubscriptions.delete(handler);
		};
	}, [world]);

	// Handle world reset
	useEffect(() => {
		const handler = () => setTraits(Array.from(world.traits));
		world[$internal].resetSubscriptions.add(handler);
		return () => {
			world[$internal].resetSubscriptions.delete(handler);
		};
	}, [world]);

	return traits;
}
