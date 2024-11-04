import { $internal, Entity, Trait, TraitInstance, World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { useWorld } from '../world/use-world';

function isWorld(target: Entity | World): target is World {
	return typeof (target as World)?.spawn === 'function';
}

export function useObserve<T extends Trait>(
	target: Entity | World,
	trait: T
): TraitInstance<T> | undefined {
	const contextWorld = useWorld();
	const world = useMemo(() => (isWorld(target) ? target : contextWorld), [target, contextWorld]);
	const entity = useMemo(
		() => (isWorld(target) ? target[$internal].worldEntity : target),
		[target]
	);

	const [value, setValue] = useState<TraitInstance<T> | undefined>(() => {
		if (entity.has(trait)) return entity.get(trait);
		return undefined;
	});

	useEffect(() => {
		const onChangeUnsub = world.onChange(trait, (e) => {
			if (e === entity) setValue(e.get(trait));
		});

		const onAddUnsub = world.onAdd([trait], (e) => {
			if (e === entity) setValue(e.get(trait));
		});

		const onRemoveUnsub = world.onRemove([trait], (e) => {
			if (e === entity) setValue(undefined);
		});

		return () => {
			onChangeUnsub();
			onAddUnsub();
			onRemoveUnsub();
		};
	}, [target, trait]);

	return value;
}
