import { $internal, type Entity, type Trait, type TraitRecord, type World } from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/use-world';

export function useTrait<T extends Trait>(
    target: Entity | World | undefined | null,
    trait: T
): TraitRecord<T> | undefined {
    const contextWorld = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    const valueRef = useRef<TraitRecord<T> | undefined>(undefined);
    const memoRef = useRef<ReturnType<typeof createSubscriptions<T>> | undefined>(undefined);

    const memo = useMemo(
        () => (target ? createSubscriptions(target, trait, contextWorld) : undefined),
        [target, trait, contextWorld]
    );

    // Update cached value when the target or trait changes
    if (memoRef.current !== memo) {
        memoRef.current = memo;
        valueRef.current = memo?.entity.has(trait) ? memo.entity.get(trait) : undefined;
    }

    useEffect(() => {
        if (!memo) return;

        const unsub = memo.subscribe((value) => {
            valueRef.current = value;
            forceUpdate();
        });

        return () => unsub();
    }, [memo]);

    return valueRef.current;
}

function createSubscriptions<T extends Trait>(target: Entity | World, trait: T, contextWorld: World) {
    // Use the context world unless the target is a world itself
    const world = isWorld(target) ? target : contextWorld;
    const entity = isWorld(target) ? target[$internal].worldEntity : target;

    return {
        entity,
        subscribe: (setValue: (value: TraitRecord<T> | undefined) => void) => {
            const onChangeUnsub = world.onChange(trait, (e) => {
                if (e === entity) setValue(e.get(trait));
            });

            const onAddUnsub = world.onAdd(trait, (e) => {
                if (e === entity) setValue(e.get(trait));
            });

            const onRemoveUnsub = world.onRemove(trait, (e) => {
                if (e === entity) setValue(undefined);
            });

            // Set initial value
            setValue(entity.has(trait) ? entity.get(trait) : undefined);

            return () => {
                onChangeUnsub();
                onAddUnsub();
                onRemoveUnsub();
            };
        },
    };
}
