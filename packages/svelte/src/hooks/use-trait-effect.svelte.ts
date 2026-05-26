import {
    $internal as internal,
    type Entity,
    type RelationPair,
    type Trait,
    type TraitRecord,
    type World,
} from '@koota/core';
import { isWorld } from '../utils/is-world';
import { type MaybeGetter, resolve } from '../utils/resolve';
import { useWorld } from '../world/world-context';

export function useTraitEffect<T extends Trait>(
    target: () => Entity | World,
    trait: MaybeGetter<T | RelationPair<T>>,
    callback: (value: TraitRecord<T> | undefined) => void
) {
    const contextWorld = useWorld();

    $effect(() => {
        const t = target();
        const resolvedTrait = resolve(trait);
        const world = isWorld(t) ? t : contextWorld;

        let entity: Entity;

        /**
         * Subscribe before reading worldEntity: world.onChange triggers lazy
         * registration so worldEntity is guaranteed to exist after this.
         */
        const onChangeUnsub = world.onChange(resolvedTrait, (e) => {
            if (e === entity) callback(e.get(resolvedTrait));
        });

        const onAddUnsub = world.onAdd(resolvedTrait, (e) => {
            if (e === entity) callback(e.get(resolvedTrait));
        });

        const onRemoveUnsub = world.onRemove(resolvedTrait, (e) => {
            if (e === entity) callback(undefined);
        });

        entity = isWorld(t) ? t[internal].worldEntity : t;
        callback(entity.has(resolvedTrait) ? entity.get(resolvedTrait) : undefined);

        return () => {
            onChangeUnsub();
            onAddUnsub();
            onRemoveUnsub();
        };
    });
}
