import { $internal, Entity, Trait, TraitInstance, World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTrait<T extends Trait>(
	target: Entity | World | undefined | null,
	trait: T
): TraitInstance<T> | undefined {
	// Get the world from context -- it may be used.
	// Note: With React 19 we can get it with use conditionally.
	const contextWorld = useWorld();

	// Memoize the target entity and a subscriber function.
	// If the target is undefined or null, undefined is returned here so the hook can exit early.
	const memo = useMemo(
		() => (target ? createSubscriptions(target, trait, contextWorld) : undefined),
		[target, trait, contextWorld]
	);

	// Initialize the state with the current value of the trait.
	const [value, setValue] = useState<TraitInstance<T> | undefined>(() => {
		return memo?.entity.has(trait) ? memo?.entity.get(trait) : undefined;
	});

	// Subscribe to changes in the trait.
	useEffect(() => {
		if (!memo) return;
		const unsubscribe = memo.subscribe(setValue);
		return () => unsubscribe();
	}, [memo]);

	return value;
}

function createSubscriptions<T extends Trait>(target: Entity | World, trait: T, contextWorld: World) {
	const world = isWorld(target) ? target : contextWorld;
	const entity = isWorld(target) ? target[$internal].worldEntity : target;

	return {
		entity,
		subscribe: (setValue: (value: TraitInstance<T> | undefined) => void) => {
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
			};
		},
	};
}
