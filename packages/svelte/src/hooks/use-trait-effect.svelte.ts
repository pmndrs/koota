import {
    $internal as internal,
    type Entity,
    type RelationPair,
    type Trait,
    type TraitRecord,
    type World,
} from '@koota/core';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/world-context';

export function useTraitEffect<T extends Trait>(
    target: () => Entity | World,
    trait: T | RelationPair<T>,
    callback: (value: TraitRecord<T> | undefined) => void
) {
    const contextWorld = useWorld();

    $effect(() => {
        const t = target();
        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        const onChangeUnsub = world.onChange(trait, (e) => {
            if (e === entity) callback(e.get(trait));
        });

        const onAddUnsub = world.onAdd(trait, (e) => {
            if (e === entity) callback(e.get(trait));
        });

        const onRemoveUnsub = world.onRemove(trait, (e) => {
            if (e === entity) callback(undefined);
        });

        callback(entity.has(trait) ? entity.get(trait) : undefined);

        return () => {
            onChangeUnsub();
            onAddUnsub();
            onRemoveUnsub();
        };
    });
}
