import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTargets<T extends Trait>(
    target: Entity | World | undefined | null,
    relation: Relation<T>
): Entity[] {
    const contextWorld = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    const memo = useMemo(
        () => (target ? createSubscriptions(target, relation, contextWorld) : undefined),
        [target, relation, contextWorld]
    );

    const valueRef = useRef<Entity[]>([]);
    const memoRef = useRef(memo);

    // Update cached value when memo changes
    if (memoRef.current !== memo) {
        memoRef.current = memo;
        valueRef.current = memo?.entity.targetsFor(relation) ?? [];
    }

    useEffect(() => {
        if (!memo) {
            valueRef.current = [];
            forceUpdate();
            return;
        }

        const unsubscribe = memo.subscribe((value) => {
            valueRef.current = value;
            forceUpdate();
        });

        return () => unsubscribe();
    }, [memo]);

    return valueRef.current;
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
        subscribe: (setValue: (value: Entity[]) => void) => {
            // Track current value for onRemove filter
            let currentValue: Entity[] = [];

            const update = (value: Entity[]) => {
                currentValue = value;
                setValue(value);
            };

            const onAddUnsub = world.onAdd(relation, (e) => {
                if (e === entity) update(entity.targetsFor(relation));
            });

            // onRemove fires before data is removed, so filter out the target
            const onRemoveUnsub = world.onRemove(relation, (e, t) => {
                if (e === entity) update(currentValue.filter((p) => p !== t));
            });

            const onChangeUnsub = world.onChange(relation, (e) => {
                if (e === entity) update(entity.targetsFor(relation));
            });

            update(entity.targetsFor(relation));

            return () => {
                onAddUnsub();
                onRemoveUnsub();
                onChangeUnsub();
            };
        },
    };
}
