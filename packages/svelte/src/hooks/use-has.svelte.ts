import {
    $internal as internal,
    $relationPair as relationPair,
    type Entity,
    type RelationPair,
    type Trait,
    type World,
} from '@koota/core';
import { isWorld } from '../utils/is-world';
import { type MaybeGetter, resolve } from '../utils/resolve';
import { useWorld } from '../world/world-context';

export function useHas(
    target: () => Entity | World | undefined | null,
    trait: MaybeGetter<Trait | RelationPair>
): { readonly current: boolean } {
    const contextWorld = useWorld();
    let value = $state(false);

    $effect(() => {
        const t = target();

        if (!t) {
            value = false;
            return;
        }

        const resolvedTrait = resolve(trait);
        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        // Wildcard pairs like ChildOf('*') fire on every pair removal, but the entity
        // may still have other pairs. Since onRemove fires before state cleanup,
        // we check targetsFor().length > 1 (the removed target is still counted).
        const isWildcard =
            !!(resolvedTrait as any)?.[relationPair] &&
            (resolvedTrait as RelationPair)[internal].target === '*';
        const wildcardRelation = isWildcard
            ? (resolvedTrait as RelationPair)[internal].relation
            : undefined;

        value = entity.has(resolvedTrait);

        const onAddUnsub = world.onAdd(resolvedTrait, (e) => {
            if (e === entity) value = true;
        });

        const onRemoveUnsub = world.onRemove(resolvedTrait, (e) => {
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
