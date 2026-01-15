import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTarget<T extends Trait>(
    target: Entity | World | undefined | null,
    relation: Relation<T>
): Entity | undefined {
    const contextWorld = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    const memo = useMemo(
        () => (target ? createSubscriptions(target, relation, contextWorld) : undefined),
        [target, relation, contextWorld]
    );

    const valueRef = useRef<Entity | undefined>(undefined);
    const memoRef = useRef(memo);

    // Update cached value when memo changes
    if (memoRef.current !== memo) {
        memoRef.current = memo;
        valueRef.current = memo?.entity.targetFor(relation);
    }

    useEffect(() => {
        if (!memo) {
            valueRef.current = undefined;
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
        subscribe: (setValue: (value: Entity | undefined) => void) => {
            const onAddUnsub = world.onAdd(relation, (e) => {
                if (e === entity) setValue(entity.targetFor(relation));
            });

            const onRemoveUnsub = world.onRemove(relation, (e) => {
                if (e === entity) setValue(entity.targetFor(relation));
            });

            const onChangeUnsub = world.onChange(relation, (e) => {
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
