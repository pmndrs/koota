import { $internal, type Entity, type TagTrait, type World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTag(
	target: Entity | World | undefined | null,
	tag: TagTrait
): boolean | undefined {
	// Get the world from context.
	const contextWorld = useWorld();

	// Memoize the target entity and a subscriber function.
	const memo = useMemo(
		() => (target ? createSubscriptions(target, tag, contextWorld) : undefined),
		[target, tag, contextWorld]
	);

	// Initialize the state with whether the entity has the tag.
	const [value, setValue] = useState<boolean | undefined>(() => {
		return memo?.entity.has(tag) ?? false;
	});

	// Subscribe to add/remove events for the tag.
	useEffect(() => {
		if (!memo) return;
		const unsubscribe = memo.subscribe(setValue);
		return () => unsubscribe();
	}, [memo]);

	return value;
}

function createSubscriptions(target: Entity | World, tag: TagTrait, contextWorld: World) {
	const world = isWorld(target) ? target : contextWorld;
	const entity = isWorld(target) ? target[$internal].worldEntity : target;

	return {
		entity,
		subscribe: (setValue: (value: boolean | undefined) => void) => {
			const onAddUnsub = world.onAdd(tag, (e) => {
				if (e === entity) setValue(true);
			});

			const onRemoveUnsub = world.onRemove(tag, (e) => {
				if (e === entity) setValue(false);
			});

			setValue(entity.has(tag));

			return () => {
				onAddUnsub();
				onRemoveUnsub();
			};
		},
	};
}
