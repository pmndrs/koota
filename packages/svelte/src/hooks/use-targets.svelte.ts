import { $internal as internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/world-context';

export function useTargets<T extends Trait>(
    target: () => Entity | World | undefined | null,
    relation: Relation<T>
): { readonly current: Entity[] } {
    const contextWorld = useWorld();
    let value = $state.raw<Entity[]>([]);

    $effect(() => {
        const t = target();

        if (!t) {
            value = [];
            return;
        }

        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        value = entity.targetsFor(relation);

        const onAddUnsub = world.onAdd(relation, (e) => {
            if (e === entity) value = entity.targetsFor(relation);
        });

        // onRemove fires before data is removed, so filter out the target
        const onRemoveUnsub = world.onRemove(relation, (e, removedTarget) => {
            if (e === entity) value = value.filter((p) => p !== removedTarget);
        });

        const onChangeUnsub = world.onChange(relation, (e) => {
            if (e === entity) value = entity.targetsFor(relation);
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
