import { $internal, type Entity, type Trait, type TraitInstance, type World } from '@koota/core';
import { useEffect, useMemo } from 'react';
import { useWorld } from '../world/use-world';
import { isWorld } from '../utils/is-world';

export function useTraitEffect<T extends Trait>(
	target: Entity | World,
	trait: T,
	callback: (value: TraitInstance<T> | undefined) => void
) {
	const contextWorld = useWorld();
	const world = useMemo(() => (isWorld(target) ? target : contextWorld), [target, contextWorld]);
	const entity = useMemo(
		() => (isWorld(target) ? target[$internal].worldEntity : target),
		[target]
	);

	useEffect(() => {
		const onChangeUnsub = world.onChange(trait, (e) => {
			if (e === entity) callback(e.get(trait));
		});

		const onAddUnsub = world.onAdd(trait, (e) => {
			if (e === entity) callback(e.get(trait));
		});

		const onRemoveUnsub = world.onRemove(trait, (e) => {
			if (e === entity) callback(undefined);
		});

		callback(entity.has(trait) ? entity.get(trait) : undefined);

		return () => {
			onChangeUnsub();
			onAddUnsub();
			onRemoveUnsub();
		};
	}, [target, trait]);
}
