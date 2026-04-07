import { $internal as internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/world-context';

export function useTarget<T extends Trait>(
    target: () => Entity | World | undefined | null,
    relation: Relation<T>
): { readonly current: Entity | undefined } {
    const contextWorld = useWorld();
    let value = $state.raw<Entity | undefined>(undefined);

    $effect(() => {
        const t = target();

        if (!t) {
            value = undefined;
            return;
        }

        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        value = entity.targetFor(relation);

        const onAddUnsub = world.onAdd(relation, (e) => {
            if (e === entity) value = entity.targetFor(relation);
        });

        const onRemoveUnsub = world.onRemove(relation, (e) => {
            if (e === entity) value = undefined;
        });

        const onChangeUnsub = world.onChange(relation, (e) => {
            if (e === entity) value = entity.targetFor(relation);
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
