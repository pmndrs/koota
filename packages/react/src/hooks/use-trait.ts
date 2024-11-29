import { $internal, Entity, Trait, TraitInstance, World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTrait<T extends Trait>(
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
		return entity.has(trait) ? entity.get(trait) : undefined;
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

		setValue(entity.has(trait) ? entity.get(trait) : undefined);

		return () => {
			onChangeUnsub();
			onAddUnsub();
			onRemoveUnsub();
			setValue(undefined);
		};
	}, [target, trait]);

	return value;
}
