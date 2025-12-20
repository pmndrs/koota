import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTarget<T extends Trait>(
	target: Entity | World | undefined | null,
	relation: Relation<T>
): Entity | undefined {
	const contextWorld = useWorld();

	const memo = useMemo(
		() => (target ? createSubscriptions(target, relation, contextWorld) : undefined),
		[target, relation, contextWorld]
	);

	const [value, setValue] = useState<Entity | undefined>(() => {
		return memo?.entity.targetFor(relation);
	});

	useEffect(() => {
		if (!memo) {
			setValue(undefined);
			return;
		}
		const unsubscribe = memo.subscribe(setValue);
		return () => unsubscribe();
	}, [memo]);

	return value;
}

function createSubscriptions<T extends Trait>(
	target: Entity | World,
	relation: Relation<T>,
	contextWorld: World
) {
	const world = isWorld(target) ? target : contextWorld;
	const entity = isWorld(target) ? target[$internal].worldEntity : target;

	return {
		entity,
		subscribe: (setValue: Dispatch<SetStateAction<Entity | undefined>>) => {
			const onAddUnsub = world.onAdd(relation, (e, t) => {
				if (e === entity) setValue(entity.targetFor(relation));
			});

			const onRemoveUnsub = world.onRemove(relation, (e, t) => {
				if (e === entity) setValue(entity.targetFor(relation));
			});

			const onChangeUnsub = world.onChange(relation, (e, t) => {
				if (e === entity) setValue(entity.targetFor(relation));
			});

			setValue(entity.targetFor(relation));

			return () => {
				onAddUnsub();
				onRemoveUnsub();
				onChangeUnsub();
			};
		},
	};
}
