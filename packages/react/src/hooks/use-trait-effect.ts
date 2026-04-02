import {
    $internal,
    type Entity,
    type RelationPair,
    type Trait,
    type TraitRecord,
    type World,
} from '@koota/core';
import { useEffect, useMemo, useRef } from 'react';
import { isWorld } from '../utils/is-world';
import { useStableTrait } from '../utils/use-stable-pair';
import { useWorld } from '../world/use-world';

export function useTraitEffect<T extends Trait>(
    target: Entity | World,
    trait: T,
    callback: (value: TraitRecord<T> | undefined) => void
): void;
export function useTraitEffect<T>(
    target: Entity | World,
    trait: RelationPair<T>,
    callback: (value: T | undefined) => void
): void;
export function useTraitEffect(
    target: Entity | World,
    trait: Trait | RelationPair,
    callback: (value: unknown) => void
) {
    const contextWorld = useWorld();
    const world = useMemo(() => (isWorld(target) ? target : contextWorld), [target, contextWorld]);
    const entity = useMemo(
        () => (isWorld(target) ? target[$internal].worldEntity : target),
        [target]
    );
    const stableTrait = useStableTrait(trait);

    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const onChangeUnsub = world.onChange(stableTrait, (e) => {
            if (e === entity) callbackRef.current(e.get(stableTrait));
        });

        const onAddUnsub = world.onAdd(stableTrait, (e) => {
            if (e === entity) callbackRef.current(e.get(stableTrait));
        });

        const onRemoveUnsub = world.onRemove(stableTrait, (e) => {
            if (e === entity) callbackRef.current(undefined);
        });

        callbackRef.current(entity.has(stableTrait) ? entity.get(stableTrait) : undefined);

        return () => {
            onChangeUnsub();
            onAddUnsub();
            onRemoveUnsub();
        };
    }, [stableTrait, world, entity]);
}
