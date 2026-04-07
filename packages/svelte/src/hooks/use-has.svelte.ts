import {
    $internal as internal,
    $relationPair as relationPair,
    type Entity,
    type RelationPair,
    type Trait,
    type World,
} from '@koota/core';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/world-context';

export function useHas(
    target: () => Entity | World | undefined | null,
    trait: Trait | RelationPair
): { readonly current: boolean } {
    const contextWorld = useWorld();
    let value = $state(false);

    // Wildcard pairs like ChildOf('*') fire on every pair removal, but the entity
    // may still have other pairs. Since onRemove fires before state cleanup,
    // we check targetsFor().length > 1 (the removed target is still counted).
    const isWildcard =
        !!(trait as any)?.[relationPair] && (trait as RelationPair)[internal].target === '*';
    const wildcardRelation = isWildcard
        ? (trait as RelationPair)[internal].relation
        : undefined;

    $effect(() => {
        const t = target();

        if (!t) {
            value = false;
            return;
        }

        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        value = entity.has(trait);

        const onAddUnsub = world.onAdd(trait, (e) => {
            if (e === entity) value = true;
        });

        const onRemoveUnsub = world.onRemove(trait, (e) => {
            if (e !== entity) return;
            if (wildcardRelation) {
                value = entity.targetsFor(wildcardRelation).length > 1;
            } else {
                value = false;
            }
        });

        return () => {
            onAddUnsub();
            onRemoveUnsub();
        };
    });

    return {
        get current() {
            return value;
        },
    };
}
