import {
    $internal,
    type Entity,
    type RelationPair,
    type Trait,
    type TraitRecord,
    type World,
} from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useStableTrait } from '../utils/use-stable-pair';
import { useWorld } from '../world/use-world';

export function useTrait<T extends Trait>(
    target: Entity | World | undefined | null,
    trait: T
): TraitRecord<T> | undefined;
export function useTrait<T>(
    target: Entity | World | undefined | null,
    trait: RelationPair<T>
): T | undefined;
export function useTrait(
    target: Entity | World | undefined | null,
    trait: Trait | RelationPair
): unknown {
    const contextWorld = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    const valueRef = useRef<unknown>(undefined);
    const memoRef = useRef<ReturnType<typeof createSubscriptions> | undefined>(undefined);
    const stableTrait = useStableTrait(trait) as Trait | RelationPair;

    const memo = useMemo(
        () => (target ? createSubscriptions(target, stableTrait, contextWorld) : undefined),
        [target, stableTrait, contextWorld]
    );

    if (memoRef.current !== memo) {
        memoRef.current = memo;
        valueRef.current = memo?.entity.has(stableTrait) ? memo.entity.get(stableTrait) : undefined;
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

function createSubscriptions(
    target: Entity | World,
    trait: Trait | RelationPair,
    contextWorld: World
) {
    // Use the context world unless the target is a world itself
    const world = isWorld(target) ? target : contextWorld;
    const entity = isWorld(target) ? target[$internal].worldEntity : target;

    return {
        entity,
        subscribe: (setValue: (value: unknown) => void) => {
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
