import { $internal as internal, type Entity, type TagTrait, type World } from '@koota/core';
import { isWorld } from '../utils/is-world';
import { useWorld } from '../world/world-context';

export function useTag(
    target: () => Entity | World | undefined | null,
    tag: TagTrait
): { readonly current: boolean } {
    const contextWorld = useWorld();
    let value = $state(false);

    $effect(() => {
        const t = target();

        if (!t) {
            value = false;
            return;
        }

        const world = isWorld(t) ? t : contextWorld;
        const entity = isWorld(t) ? t[internal].worldEntity : t;

        value = entity.has(tag);

        const onAddUnsub = world.onAdd(tag, (e) => {
            if (e === entity) value = true;
        });

        const onRemoveUnsub = world.onRemove(tag, (e) => {
            if (e === entity) value = false;
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
