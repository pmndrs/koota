import {
    $internal,
    $relationPair,
    type Entity,
    type RelationPair,
    type Trait,
    type World,
} from '@koota/core';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useStableTrait } from '../utils/use-stable-pair';
import { useWorld } from '../world/use-world';

export function useHas(
    target: Entity | World | undefined | null,
    trait: Trait | RelationPair
): boolean {
    const contextWorld = useWorld();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    const stableTrait = useStableTrait(trait);

    const memo = useMemo(
        () => (target ? createSubscriptions(target, stableTrait, contextWorld) : undefined),
        [target, stableTrait, contextWorld]
    );

    const valueRef = useRef<boolean>(false);
    const memoRef = useRef(memo);

    if (memoRef.current !== memo) {
        memoRef.current = memo;
        valueRef.current = memo?.entity.has(stableTrait) ?? false;
    }

    useEffect(() => {
        if (!memo) {
            valueRef.current = false;
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

function createSubscriptions(
    target: Entity | World,
    trait: Trait | RelationPair,
    contextWorld: World
) {
    const world = isWorld(target) ? target : contextWorld;
    const entity = isWorld(target) ? target[$internal].worldEntity : target;

    // Wildcard pairs like ChildOf('*') fire on every pair removal, but the entity
    // may still have other pairs. Since onRemove fires before state cleanup,
    // we check targetsFor().length > 1 (the removed target is still counted).
    const isWildcard =
        !!(trait as any)?.[$relationPair] && (trait as RelationPair).target === '*';
    const wildcardRelation = isWildcard
        ? (trait as RelationPair).relation
        : undefined;

    return {
        entity,
        subscribe: (setValue: (value: boolean) => void) => {
            const onAddUnsub = world.onAdd(trait, (e) => {
                if (e === entity) setValue(true);
            });

            const onRemoveUnsub = world.onRemove(trait, (e) => {
                if (e !== entity) return;
                if (wildcardRelation) {
                    setValue(entity.targetsFor(wildcardRelation).length > 1);
                } else {
                    setValue(false);
                }
            });

            setValue(entity.has(trait));

            return () => {
                onAddUnsub();
                onRemoveUnsub();
            };
        },
    };
}
