import {
    $internal as internal,
    type Entity,
    type Relation,
    type Trait,
    type World,
} from '@koota/core';
import { isWorld } from '../utils/is-world';
import { type MaybeGetter, resolve } from '../utils/resolve';
import { useWorld } from '../world/world-context';

export function useTarget<T extends Trait>(
    target: () => Entity | World | undefined | null,
    relation: MaybeGetter<Relation<T>>
): { readonly current: Entity | undefined } {
    const contextWorld = useWorld();
    let value = $state.raw<Entity>();

    $effect(() => {
        const t = target();

        if (!t) {
            value = undefined;
            return;
        }

        const resolvedRelation = resolve(relation);
        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        value = entity.targetFor(resolvedRelation);

        const onAddUnsub = world.onAdd(resolvedRelation, (e) => {
            if (e === entity) value = entity.targetFor(resolvedRelation);
        });

        const onRemoveUnsub = world.onRemove(resolvedRelation, (e) => {
            if (e === entity) value = undefined;
        });

        const onChangeUnsub = world.onChange(resolvedRelation, (e) => {
            if (e === entity) value = entity.targetFor(resolvedRelation);
        });

        return () => {
            onAddUnsub();
            onRemoveUnsub();
            onChangeUnsub();
        };
    });

    return {
        get current() {
            return value;
        },
    };
}
