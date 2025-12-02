import { $internal, Trait, type Entity, type World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useHas(target: Entity | World | undefined | null, trait: Trait): boolean {
	// Get the world from context.
	const contextWorld = useWorld();

	// Memoize the target entity and a subscriber function.
	const memo = useMemo(
		() => (target ? createSubscriptions(target, trait, contextWorld) : undefined),
		[target, trait, contextWorld]
	);

	// Initialize the state with whether the entity has the tag.
	const [value, setValue] = useState<boolean | undefined>(() => {
		return memo?.entity.has(trait) ?? false;
	});

	// Subscribe to add/remove events for the tag.
	useEffect(() => {
		if (!memo) return;
		const unsubscribe = memo.subscribe(setValue);
		return () => unsubscribe();
	}, [memo]);

	return value ?? false;
}

function createSubscriptions(target: Entity | World, trait: Trait, contextWorld: World) {
	const world = isWorld(target) ? target : contextWorld;
	const entity = isWorld(target) ? target[$internal].worldEntity : target;

	return {
		entity,
		subscribe: (setValue: (value: boolean | undefined) => void) => {
			const onAddUnsub = world.onAdd(trait, (e) => {
				if (e === entity) setValue(true);
			});

			const onRemoveUnsub = world.onRemove(trait, (e) => {
				if (e === entity) setValue(false);
			});

			setValue(entity.has(trait));

			return () => {
				onAddUnsub();
				onRemoveUnsub();
			};
		},
	};
}
