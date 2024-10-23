import { Entity, Trait, TraitInstance } from '@koota/core';
import { useEffect, useState } from 'react';
import { useWorld } from '../world/use-world';

export function useObserve<T extends Trait>(entity: Entity, trait: T) {
	const world = useWorld();
	const [value, setValue] = useState<TraitInstance<T> | undefined>(() => {
		if (entity.has(trait)) return entity.get(trait);
		return undefined;
	});

	useEffect(() => {
		const unsub = world.onChange(trait, (e) => {
			if (e === entity) setValue(e.get(trait));
		});

		return () => {
			unsub();
		};
	}, [entity, trait]);

	return value;
}
