import type { Trait, World } from '@koota/core';
import { useEffect, useState } from 'react';

export function useTraitEntityCount(world: World, trait: Trait) {
	const [count, setCount] = useState(() => world.query(trait).length);

	useEffect(() => {
		const update = () => setCount(world.query(trait).length);

		const unsubAdd = world.onAdd(trait, update);
		const unsubRemove = world.onRemove(trait, update);

		update();

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, trait]);

	return count;
}
