import { $internal, type Entity, type Trait, type TraitRecord, type World } from '@koota/core';
import { useEffect, useMemo, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTraitEffect<T extends Trait>(
	target: Entity | World,
	trait: T,
	callback: (value: TraitRecord<T> | undefined) => void
) {
	const contextWorld = useWorld();
	const world = useMemo(() => (isWorld(target) ? target : contextWorld), [target, contextWorld]);
	const entity = useMemo(
		() => (isWorld(target) ? target[$internal].worldEntity : target),
		[target]
	);

	// Memoize the callback so it doesn't cause rerenders if an arrow function is used.
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		const onChangeUnsub = world.onChange(trait, (e) => {
			if (e === entity) callbackRef.current(e.get(trait));
		});

		const onAddUnsub = world.onAdd(trait, (e) => {
			if (e === entity) callbackRef.current(e.get(trait));
		});

		const onRemoveUnsub = world.onRemove(trait, (e) => {
			if (e === entity) callbackRef.current(undefined);
		});

		callbackRef.current(entity.has(trait) ? entity.get(trait) : undefined);

		return () => {
			onChangeUnsub();
			onAddUnsub();
			onRemoveUnsub();
		};
	}, [trait, world, entity]);
}
