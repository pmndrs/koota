import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTargets<T extends Trait>(
	target: Entity | World | undefined | null,
	relation: Relation<T>
): Entity[] {
	const contextWorld = useWorld();

	const memo = useMemo(
		() => (target ? createSubscriptions(target, relation, contextWorld) : undefined),
		[target, relation, contextWorld]
	);

	const [value, setValue] = useState<Entity[]>(() => {
		return memo?.entity.targetsFor(relation) ?? [];
	});

	useEffect(() => {
		if (!memo) {
			setValue([]);
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
	const relationTrait = relation[$internal].trait;

	return {
		entity,
		subscribe: (setValue: (value: Entity[]) => void) => {
			const onChangeUnsub = world.onChange(relationTrait, (e) => {
				if (e === entity) setValue(entity.targetsFor(relation));
			});

			const onAddUnsub = world.onAdd(relationTrait, (e) => {
				if (e === entity) setValue(entity.targetsFor(relation));
			});

			const onRemoveUnsub = world.onRemove(relationTrait, (e) => {
				if (e === entity) setValue([]);
			});

			setValue(entity.targetsFor(relation));

			return () => {
				onChangeUnsub();
				onAddUnsub();
				onRemoveUnsub();
			};
		},
	};
}
