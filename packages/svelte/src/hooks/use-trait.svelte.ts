import {
    $internal as internal,
    type Entity,
    type RelationPair,
    type Trait,
    type TraitRecord,
    type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/world-context';

export function useTrait<T extends Trait>(
    target: () => Entity | World | undefined | null,
    trait: T | RelationPair<T>
): { readonly current: TraitRecord<T> | undefined } {
    const contextWorld = useWorld();
    let value = $state.raw<TraitRecord<T> | undefined>(undefined);
    // Version counter to force reactivity when the value reference is the same (AoS traits).
    // Only read in the getter, never in the effect.
    let version = $state(0);

    $effect(() => {
        const t = target();

        if (!t) {
            value = undefined;
            return;
        }

        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        value = entity.has(trait) ? entity.get(trait) : undefined;

        const onChangeUnsub = world.onChange(trait, (e) => {
            if (e === entity) {
                value = e.get(trait);
                untrack(() => version++);
            }
        });

        const onAddUnsub = world.onAdd(trait, (e) => {
            if (e === entity) value = e.get(trait);
        });

        const onRemoveUnsub = world.onRemove(trait, (e) => {
            if (e === entity) value = undefined;
        });

        return () => {
            onChangeUnsub();
            onAddUnsub();
            onRemoveUnsub();
        };
    });

    return {
        get current() {
            void version;
            return value;
        },
    };
}
